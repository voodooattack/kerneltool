import chalk from "chalk";
import * as childProcess from "child_process";
import { ListrErrorTypes, ListrRendererFactory, ListrTask, ListrTaskWrapper } from "listr2";

export interface ExecTaskWrapper<Ctx, Renderer extends ListrRendererFactory> extends ListrTaskWrapper<Ctx, Renderer> {
  process: childProcess.ChildProcess;
}

export function makeExecTask<Ctx = any, Renderer extends ListrRendererFactory = any>(
  command: string,
  args: string[],
  taskOptions?: Partial<ListrTask<Ctx, Renderer>>
): ListrTask<Ctx, Renderer> {
  const dispCommand = `${chalk.white(command)} ${chalk.dim(args.join(" "))}`;
  return {
    title: `Execute "${dispCommand}"`,
    ...(taskOptions ?? {}),
    task: async (ctx, task) => {
      await new Promise<number>((resolve, reject) => {
        const proc = childProcess.spawn(command, args, {
          shell: false,
          stdio: ["inherit", "pipe", "pipe"]
        });
        proc.on("exit", code => {
          if (code !== 0) {
            const err = new Error(
              `Error: process exited with non-zero exit code ${code} while executing: "${dispCommand}"`
            );
            task.report(err, ListrErrorTypes.HAS_FAILED);
            return reject(err);
          }
          resolve(0);
        });
        proc.on("error", reject);
        proc.stdout.pipe(task.stdout());
        proc.stderr.pipe(task.stdout());
      });
      return taskOptions?.task?.(ctx, task);
    }
  };
}
