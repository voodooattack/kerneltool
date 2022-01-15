import { parsePackages } from 'apt-parser';
import cacache from 'cacache';
import chalk from 'chalk';
import CliTable from "cli-table";
import { Command, Option } from "clipanion";
import isRoot from "is-root";
import { ListrTask } from "listr2";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { appPaths } from "../lib/config.js";
import { KernelInfo, PackageInfo } from "../lib/repo.js";
import { makeDownloadTask } from "../tasks/DownloadTask.js";
import { makeExecTask } from "../tasks/ExecTask.js";
import { BaseCommand } from "./BaseCommand.js";

type InstallCommandContext = {
  kernelVersion: string;
  arch: string;
  variant: string;
  info: KernelInfo;
  downloadTasks: ListrTask[];
  depStrings: string[];
  writeTasks: ListrTask[];
  packages: PackageInfo[];
};

export class InstallCommand extends BaseCommand {
  static paths = [[`install`]];
  static usage = Command.Usage({
    description: "Install a specific kernel version. This command requires root privileges.",
    examples: [["Install kernel 5.13-generic with the current system architecture:", `$0 install 5.13 generic"`]]
  });

  kernelVersion = Option.String({ name: "kernel", required: true });
  variant = Option.String({ name: "variant", required: false });

  yes = Option.Boolean("-y,--yes", {
    required: false,
    description: "Don't prompt for user input."
  });

  async task(): Promise<ListrTask> {
    return {
      task: async (ctx, root) => {
        if (!isRoot()) {
          console.error(`${chalk.red.bold("Error:")} This subcommand requires root privileges.`);
          process.exit(1);
        }
        ctx.kernelVersion = this.kernelVersion;
        ctx.arch = this.systemArch;
        ctx.variant = this.variant ?? "generic";
        return root.newListr<InstallCommandContext>([
          {
            title: "",
            task: async (ctx, task) => {
              if (
                !this.yes &&
                !(await task.prompt({
                  type: "Confirm",
                  message: `Really install kernel ${ctx.kernelVersion}-${ctx.variant}_${ctx.arch}?`
                }))
              ) {
                task.skip("Aborting");
                process.exit(1);
              }
            }
          },
          {
            title: "Fetching kernel listings...",
            task: async (ctx, task) => {
              await this.repo.reloadListings();
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: `Read information for kernel ${chalk.yellow(ctx.kernelVersion)}...`,
            task: async (ctx, task) => {
              ctx.info = await this.repo.populateKernelInfo(ctx.kernelVersion, [ctx.arch]);
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: `Checking kernel...`,
            task: async (ctx, task) => {
              const arch = ctx.info.archs[ctx.arch];
              const variant = arch.packages[ctx.variant];
              if (!variant) {
                throw new Error(`Kernel ${variant} is missing for configuration ${ctx.info.version}_${ctx.arch}\n`);
              }

              const dispName = `${ctx.info.version}-${variant.name}_${arch.name}`;

              if (!variant.files.headers) {
                throw new Error(`Missing headers package for kernel ${dispName}`);
              }

              if (!variant.files.modules) {
                throw new Error(`Missing modules package for kernel ${dispName}`);
              }

              if (!variant.files.image && !variant.files.imageUnsigned) {
                throw new Error(`Missing image package for kernel ${dispName}`);
              }

              if (!variant.files.image && variant.files.imageUnsigned) {
                task.title += " " + chalk.red.bold(`⚠️  Unsigned`);
                const confirm =
                  this.yes ||
                  (await task.prompt({
                    type: "Confirm",
                    header: chalk.white.bold(`Could not find a signed image for kernel ${chalk.white(dispName)}`),
                    message: `Proceed anyway?`,
                    footer: chalk.yellow
                      .bold`ℹ️  Please note that any DKMS modules installed on your system requiring a signed kernel may completely break the installation process.`
                  }));
                if (!confirm) {
                  task.skip(`Aborting install of unsigned kernel image ${chalk.white(dispName)}`);
                  process.exit(1);
                }
              }
              const toInstall = [
                ...variant.files.headers!,
                variant.files.image ?? variant.files.imageUnsigned!,
                variant.files.modules!
              ];
              ctx.downloadTasks = toInstall.map(pkg => {
                task.output += `${chalk.white.dim(pkg!.debUrl)}`;
                return makeDownloadTask<InstallCommandContext>(pkg!.debUrl, true);
              });
              ctx.packages = toInstall;
              if (variant.files.image) task.title += " " + chalk.white.bold`Ok`;
              task.title += `\n${ctx.downloadTasks.length} files will be downloaded.`;
            }
          },
          {
            title: `Download files...`,
            task: async (ctx, task) =>
              task.newListr(parent => [
                {
                  title: "",
                  task: async (ctx, task) => {
                    return task.newListr(ctx.downloadTasks, { concurrent: true });
                  }
                },
                {
                  task() {
                    parent.title += " " + chalk.white.bold("Ok");
                  }
                }
              ])
          },
          {
            title: `Verify cache...`,
            options: {
              persistentOutput: true
            },
            task: async (ctx, task) => {
              task.output = "";
              await cacache.verify(appPaths.cache, {
                log: {
                  silly(source: string, ...text: string[]) {
                    task.output = `${chalk.cyan(source)}: ${text.join(" ")}`;
                  }
                }
              });
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: "Collect dependencies...",
            task: async (ctx, task) => {
              const infos = await Promise.all(ctx.packages.map(pkg => cacache.get.info(appPaths.cache, pkg.debUrl)));
              const controlData = await Promise.all(
                infos.map(async file => {
                  const tmp = crypto.randomUUID();
                  const outPath = path.join(appPaths.temp, tmp);
                  await fsp.mkdir(outPath, { recursive: true });
                  childProcess.spawnSync(`dpkg`, [`-e`, file.path, outPath], { encoding: "utf-8" });
                  const controlFile = path.join(outPath, "control");
                  const controlContent = fs.readFileSync(controlFile, { encoding: "utf-8" });
                  return controlContent;
                })
              );
              type DebControl = {
                package: string;
                depends: string[];
              };
              const packages: DebControl[] = parsePackages(controlData.join("\n\n")).map(m => ({
                package: m.get("Package")!,
                depends:
                  m
                    .get("Depends")
                    ?.split(",")
                    ?.map(s => s.trim()) ?? []
              }));
              const deps = [];
              // TODO: Me from the future... Please make this less ugly.
              for (let v of packages) {
                deps.push(
                  ...v.depends.filter(p => !p.split("|").find(s => packages.find(pkg => pkg.package == s.trim())))
                );
              }
              ctx.depStrings = deps;
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: "Satisfy dependencies...",
            options: { persistentOutput: true },
            task: async (ctx, task) => {
              const results = ctx.depStrings
                .map(s => s.split(" "))
                .map(([n, ...rest]) => [n, rest.join(" ")])
                .map(([n, ver]) => {
                  let error: string | undefined = undefined;
                  try {
                    childProcess.execSync(`apt-get satisfy '${[n, ver].join(" ")}'`, {
                      encoding: "utf-8",
                      stdio: "pipe"
                    });
                  } catch (e: any) {
                    const str = e.output[1].split("\n") as string[];
                    error = str
                      .filter(s => s.match(/depends/i))
                      .map(s => s.substring(s.lastIndexOf("Depends")))
                      .filter(s => !!s)
                      .join("\n");
                    if (!error.length) error = e.message;
                  }
                  return [n, ver, error];
                });
              const haveProblems = results.reduce((p, n) => p || typeof n[2] === "string", false);
              const depTable = new CliTable({ head: ["Package", "Version", "Satisfiable?"] });
              depTable.push(
                ...results.map(([n, ver, error]) => [
                  chalk.white.bold(n),
                  `${chalk.yellow.bold(ver ? "→ " : "★")}${chalk.yellow(ver)}`,
                  typeof error !== "string"
                    ? chalk.green.bold("✔")
                    : error
                        .split("\n")
                        .map(s => `${chalk.red.bold("✖")} ${s.trim()}`)
                        .join("\n")
                ])
              );
              if (!this.yes || haveProblems) {
                if (haveProblems) {
                  const sel = await task.prompt({
                    type: "Select",
                    header: `Need to satisfy the following dependencies: \n${depTable.toString()}`,
                    message: "What would you like to do?",
                    choices: [
                      {
                        name: "install",
                        message: `Try to install the required dependencies${haveProblems ? " anyway" : ""}.`
                      },
                      { name: "skip", message: "Skip installing the dependencies." },
                      { name: "abort", message: "Abort installation." }
                    ]
                  });
                  if (sel === "abort") process.exit(1);
                  else if (sel === "skip") return task.skip("Skipping");
                } else {
                  const confirm = await task.prompt({
                    type: "Confirm",
                    header: `Need to satisfy the following dependencies: \n${depTable.toString()}`,
                    message: "Proceed?"
                  });
                  if (!confirm) process.exit(1);
                }
              }
              return task.newListr(
                makeExecTask("apt-get", ["satisfy", ...ctx.depStrings], {
                  options: { bottomBar: Infinity, persistentOutput: true },
                  task: async () => {
                    task.title += " " + chalk.white.bold("Ok");
                  }
                })
              );
            }
          },
          {
            title: `Install packages...`,
            task: async (ctx, task) => {
              const infos = await Promise.all(ctx.packages.map(pkg => cacache.get.info(appPaths.cache, pkg.debUrl)));
              return task.newListr(
                makeExecTask("dpkg", ["-i", ...infos.map(info => info.path)], {
                  options: { bottomBar: Infinity, persistentOutput: true },
                  task: async () => {
                    task.title += " " + chalk.white.bold("Ok");
                  }
                })
              );
            }
          }
        ]);
      }
    };
  }
}
