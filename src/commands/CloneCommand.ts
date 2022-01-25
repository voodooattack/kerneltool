import cacache from "cacache";
import chalk from "chalk";
import { Command, Option } from "clipanion";
import { ListrTask } from "listr2";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";

import { appPaths, UBUNTU_MAINLINE_GIT } from "../lib/config.js";
import { KernelInfo } from "../lib/repo.js";
import { makeDownloadTask } from "../tasks/DownloadTask.js";
import { asyncFilterSeq } from "../util/async.js";
import { BaseCommand } from "./BaseCommand.js";
import { KernelSummary } from "../lib/repo.js";
import { makeExecTask } from "../tasks/ExecTask.js";

type SourceCommandContext = {
  gitUrl: string;
  kernelVersion: string;
  outputDir: string;
  summary: KernelSummary;
  downloadTasks: ListrTask[];
};

export class CloneComamnd extends BaseCommand {
  static paths = [[`clone`]];
  static usage = Command.Usage({
    description: "Clone the source code for a specific kernel version to a directory.",
    examples: [[`Clone kernel 5.13`, `$0 clone 5.13 ./source`]]
  });

  gitUrl = Option.String("--git-repo", {
    required: false,
    description: `Override mainline kernel source GIT url. Default is: ${UBUNTU_MAINLINE_GIT}`
  });

  kernelVersion = Option.String({ name: "kernel", required: true });
  outputDir = Option.String({ name: "directory", required: true });

  override async task(): Promise<ListrTask<SourceCommandContext>> {
    return {
      task: async (ctx, root) => {
        ctx.outputDir = this.outputDir;
        ctx.kernelVersion = this.kernelVersion;
        ctx.gitUrl = this.gitUrl ?? UBUNTU_MAINLINE_GIT;
        return root.newListr<SourceCommandContext>([
          {
            title: "Fetching kernel listings...",
            task: async (ctx, task) => {
              await this.repo.reloadListings();
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: `Read summary for kernel ${chalk.yellow(this.kernelVersion)}...`,
            task: async (ctx, task) => {
              ctx.summary = await this.repo.populateKernelSummary(this.kernelVersion);
              task.title += " " + chalk.white.bold("Ok");
            }
          },
          {
            title: `Clone sources...`,
            task: async (ctx, task) => {
              return task.newListr(
                makeExecTask(
                  "git",
                  [
                    "clone",
                    "-b",
                    ctx.summary.commitLabel,
                    "-c",
                    `remote.origin.fetch=+${ctx.summary.commitHash}:refs/remotes/origin/${ctx.summary.commitHash}`,
                    "--depth",
                    "1",
                    "--progress",
                    `${ctx.gitUrl}`,
                    ctx.outputDir
                  ],
                  {
                    task: async () => {
                      task.title += " " + chalk.white.bold("Ok");
                    }
                  }
                )
              );
            }
          }
        ]);
      }
    };
  }
}
