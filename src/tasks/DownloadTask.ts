import chalk from "chalk";
import filesize from "filesize";
import { ListrRendererFactory, ListrSubClassOptions, ListrTask } from "listr2";
import { Response } from "node-fetch";
import * as path from "node:path";

import { downloadFromCache } from "../util/cache.js";
import { download } from "../util/download.js";
import { makeProgressTask } from "./ProgressTask.js";

function fixedSize(value: number, options: Parameters<typeof filesize>["1"] & { padInt?: number; padDec?: number }) {
  const [val, label] = filesize(value, { ...options, output: "array" });
  return `${val.toFixed(options.round ?? 2).padStart((options.padInt ?? 0) + (options.padDec ?? 2), "0")} ${label}`;
}

export function makeDownloadTask<Ctx, Renderer extends ListrRendererFactory = any>(
  url: string,
  useCache: boolean = true,
  rendererOptions?: ListrSubClassOptions<Ctx, Renderer>,
  subTasks?: (
    result: Awaited<ReturnType<typeof downloadFromCache>>
  ) => ListrTask<Ctx, Renderer> | ListrTask<Ctx, Renderer>[]
): ListrTask<Ctx, Renderer> {
  return makeProgressTask<Ctx, Renderer>({
    title: `Download ${chalk.white.dim(path.basename(url))}`,
    task: async (_ctx, task) => {
      const result = await (useCache ? downloadFromCache : download)({
        url,
        progress(data) {
          const transferred = fixedSize(data.bytesCompleted, {
            round: 2
          });
          const size = fixedSize(data.bytesTotal ?? Infinity, {
            round: 2
          });
          const speed = `${fixedSize(data.bytesPerSecond ?? Infinity, {
            round: 2
          })}/s`;
          task.reportProgress({
            percentage: data.percentage,
            etaMs: data.msRemaining,
            fields: [`${transferred} of ${size}`, speed]
          });
        }
      });
      const shim: [Response | null, NodeJS.ReadableStream] = useCache
        ? (result as any)
        : [result as any, (result as any).body!];
      if (!shim[0]) task.title += " " + chalk.green("(cached)");
      task.title += " " + chalk.white.bold("Ok");
      const more = subTasks?.(shim);
      return more ? task.newListr<Ctx>(more as any, rendererOptions) : undefined;
    }
  });
}
