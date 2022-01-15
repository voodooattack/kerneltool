import chalk from "chalk";
import dayjs from "dayjs";
import { ListrRendererFactory, ListrTask, ListrTaskResult, ListrTaskWrapper } from "listr2";
// @ts-ignore
import unicodeProgress from "unicode-progress";

export type ProgressData = {
  percentage?: number;
  etaMs?: number;
  fields?: string[];
};

export interface ProgressTaskWrapper<Ctx, Renderer extends ListrRendererFactory>
  extends ListrTaskWrapper<Ctx, Renderer> {
  reportProgress(...datas: ProgressData[]): void;
}

export type ProgressTask<Ctx, Renderer extends ListrRendererFactory> = Omit<ListrTask<Ctx, Renderer>, "task"> & {
  task(ctx: Ctx, task: ProgressTaskWrapper<Ctx, Renderer>): void | ListrTaskResult<Ctx>;
};

export function makeProgressTask<Ctx, Renderer extends ListrRendererFactory = any>(
  taskOptions: ProgressTask<Ctx, Renderer>
): ListrTask {
  return {
    ...taskOptions,
    async task(ctx, task) {
      const bar = unicodeProgress({ width: 30 });
      function reportProgress(this: ListrTaskWrapper<any, any>, ...datas: ProgressData[]) {
        this.output = datas
          .map(data => {
            const percentage = 100 * (data.percentage ?? 0);
            const percentageStr = typeof data.percentage !== "undefined" ? `${percentage.toFixed(2)}%` : "?";
            const etaStr =
              typeof data.etaMs !== "undefined"
                ? dayjs().startOf("day").millisecond(data.etaMs).format("HH:mm:ss")
                : "?";
            const label = [
              chalk.dim("[") + chalk.white(bar(percentage)) + chalk.dim("]"),
              chalk.yellow.bold(percentageStr),
              ...(data.fields ?? []),
              etaStr
            ].join(chalk.dim(" | "));
            return label;
          })
          .join("\n");
      }
      const wrappedTask = new Proxy(task as ProgressTaskWrapper<Ctx, Renderer>, {
        get: function (target, prop, receiver) {
          if (prop === "reportProgress") {
            return reportProgress;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
      return taskOptions.task(ctx, wrappedTask);
    }
  };
}
