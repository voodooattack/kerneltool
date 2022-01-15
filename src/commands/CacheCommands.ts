import cacache from "cacache";
import { Command } from "clipanion";
import * as fs from "node:fs";

import { appPaths } from "../lib/config.js";

export class CacheClearCommand extends Command {
  static paths = [[`cache`, `clear`]];
  static usage = Command.Usage({
    description: "Clears the cache."
  });

  async execute(): Promise<number | void> {
    process.stderr.write(`Clearing cache... \n`);
    if (fs.existsSync(appPaths.cache)) await cacache.rm.all(appPaths.cache);
    return 0;
  }
}

export class CacheInspectCommand extends Command {
  static paths = [[`cache`, `inspect`]];
  static usage = Command.Usage({
    description: "Inspects the cache."
  });

  async execute(): Promise<number | void> {
    const cache = await cacache.ls(appPaths.cache)!;
    console.log([...Object.values(cache)]);
    return 0;
  }
}
