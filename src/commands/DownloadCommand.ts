import cacache from 'cacache';
import chalk from 'chalk';
import { Command, Option } from 'clipanion';
import { ListrTask } from 'listr2';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { appPaths } from "../lib/config.js";
import { KernelInfo } from "../lib/repo.js";
import { makeDownloadTask } from "../tasks/DownloadTask.js";
import { asyncFilterSeq } from "../util/async.js";
import { BaseCommand } from "./BaseCommand.js";

type DownloadCommandContext = {
  archs: string[];
  variants: string[];
  outputDir?: string;
  info: KernelInfo;
  downloadTasks: ListrTask[];
  writeTasks: ListrTask[];
};

export class DownloadCommand extends BaseCommand {
  static paths = [[`download`]];
  static usage = Command.Usage({
    description:
      "Download a specific kernel version to the cache. Will optionally copy the .deb packages to an output directory.",
    examples: [["Download kernel 5.13 with a generic image:", `$0 install -v generic 5.13 <output-dir>"`]]
  });

  kernelVersion = Option.String({ name: "kernel", required: true });
  outputDir = Option.String({ name: "output-directory", required: false });

  kernelVariants = Option.Array("-v,--variant", {
    required: false,
    description: `Kernel variant to download. Defaults to "generic". You may pass this option multiple times.`
  });

  archs = Option.Array("-a,--arch", {
    required: false,
    description: `Binary architectures to download. Defaults to "${this.systemArch}" on this machine.`
  });

  overwrite = Option.Boolean("-o,--overwrite", {
    required: false,
    description: "Overwrite package files in output directory?"
  });

  async task(): Promise<ListrTask> {
    return {
      task: async (ctx, root) => {
        ctx.outputDir = this.outputDir;
        ctx.archs = this.archs ?? [this.systemArch];
        ctx.variants = this.kernelVariants ?? ["generic"];
        return root.newListr<DownloadCommandContext>([
          {
            title: "Fetching kernel listings...",
            task: async (ctx, task) => {
              await this.repo.reloadListings();
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: `Read information for kernel ${chalk.yellow(this.kernelVersion)}...`,
            task: async (ctx, task) => {
              ctx.info = await this.repo.populateKernelInfo(this.kernelVersion, ctx.archs);
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: `Create file lists...`,
            task: async (ctx, task) => {
              const pkgs = ctx.archs.flatMap(a =>
                ctx.variants.flatMap(v => {
                  const arch = ctx.info.archs[a];
                  const variant = arch.packages[v];
                  if (!variant) {
                    task.output += `Kernel ${v} is missing for configuration ${ctx.info.version}-${a}\n`;
                    return [];
                  }
                  return Object.values(variant.files).flatMap(pkg => {
                    if (Array.isArray(pkg)) {
                      return pkg.map(pkg => {
                        const outputPath = ctx.outputDir ? path.join(ctx.outputDir, pkg.deb) : undefined;
                        if (outputPath) task.output += `${chalk.white.dim(pkg.debUrl)} -> ${chalk.yellow(outputPath)}`;
                        return { arch, variant, pkg, outputPath, url: pkg.debUrl };
                      });
                    }
                    const outputPath = ctx.outputDir ? path.join(ctx.outputDir, pkg.deb) : undefined;
                    if (outputPath) task.output += `${chalk.white.dim(pkg.debUrl)} -> ${chalk.yellow(outputPath)}`;
                    return { arch, variant, pkg, outputPath, url: pkg.debUrl };
                  });
                })
              );
              const filtered = await asyncFilterSeq(pkgs, async file => {
                if (file.outputPath && !this.overwrite && fs.existsSync(file.outputPath)) {
                  const overwrite = await task.prompt({
                    type: "Confirm",
                    message: `Really overwrite ${file.outputPath}?`
                  });
                  return overwrite;
                }
                return true;
              });
              ctx.writeTasks = [];
              ctx.downloadTasks = filtered.map(({ arch, variant, pkg, url, outputPath }): ListrTask => {
                return makeDownloadTask<DownloadCommandContext>(url, true, {}, ([, stream]) => {
                  return {
                    task(ctx, data) {
                      if (outputPath)
                        ctx.writeTasks.push({
                          title: `Write ${chalk.white.dim(outputPath)}...`,
                          task: async (_ctx, task) => {
                            await pipeline(stream, fs.createWriteStream(outputPath));
                            task.title += " " + chalk.white.bold`Ok`;
                          }
                        });
                      else task.skip("No output path. Skipping copy action.");
                    }
                  };
                });
              });
              task.title += " " + chalk.white.bold`Ok` + `\n${ctx.downloadTasks.length} files will be downloaded.`;
            }
          },
          {
            task: async (ctx, task) => {
              return task.newListr([
                {
                  title: `Download files...`,
                  task: async (ctx, task) => {
                    return task.newListr(parent => [
                      {
                        title: "",
                        task: async (ctx, task) => {
                          return task.newListr(ctx.downloadTasks, {
                            concurrent: true
                          });
                        }
                      },
                      {
                        task() {
                          parent.title += " " + chalk.white.bold("Ok");
                        }
                      }
                    ]);
                  }
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
                  title: `Create output directory...`,
                  task: async (ctx, task) => {
                    if (!ctx.outputDir) return task.skip("Downloading to cache. Skipping output directory creation.");
                    if (!fs.existsSync(ctx.outputDir)) {
                      await fsp.mkdir(ctx.outputDir, { recursive: true });
                    } else task.skip(`${task.title} directory "${this.outputDir}" already exists.`);
                    task.title += " " + chalk.white.bold("Ok");
                  }
                },
                {
                  title: `Copy files...`,
                  task: async (ctx, task) => {
                    if (!ctx.outputDir) return task.skip("Downloading to cache. No files to copy.");
                    return task.newListr(parent => [
                      {
                        title: "",
                        task: async (ctx, task) => {
                          return task.newListr(ctx.writeTasks, {
                            concurrent: true
                          });
                        }
                      },
                      {
                        task() {
                          parent.title += " " + chalk.white.bold("Ok");
                        }
                      }
                    ]);
                  }
                }
              ]);
            }
          }
        ]);
      }
    };
  }
}
