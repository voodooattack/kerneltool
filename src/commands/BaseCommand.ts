import { Command, Option } from "clipanion";
import { ListrTask, Listr } from "listr2";
import { UBUNTU_MAINLINE_URL } from "../lib/config.js";
import { MainlineRepo } from "../lib/repo.js";
import Enquirer from "enquirer";

export abstract class BaseCommand extends Command {
  url = Option.String("--repo", {
    required: false,
    description: `Override mainline kernel URL. Default is: ${UBUNTU_MAINLINE_URL}`
  });

  private _repo?: MainlineRepo;

  readonly systemArch = process.arch === "x64" ? "amd64" : process.arch;

  get repo() {
    if (!this._repo) this._repo = new MainlineRepo(this.url ?? undefined);
    return this._repo!;
  }

  async task(): Promise<ListrTask | void> {}

  override async execute(): Promise<number | void> {
    const task = await this.task();
    if (!task) throw new Error("A command must override either task() or execute()");
    const runner = new Listr(task, { concurrent: false, injectWrapper: { enquirer: new Enquirer() } } as any);
    await runner.run();
    return 0;
  }
}
