#!/usr/bin/env node

import { Builtins, Cli } from "clipanion";
import * as path from "node:path";
import * as fsp from "node:fs/promises";
import { parse } from "envfile";
import chalk from "chalk";

// @ts-ignore
import { pkg } from "./lib/config.js";
import commands from "./commands/index.js";

async function main() {
  const lsbRelease = parse(await fsp.readFile("/etc/lsb-release", { encoding: "utf-8" }));

  if (lsbRelease["DISTRIB_ID"] !== "Ubuntu") {
    console.error(chalk.yellow`This tool is designed to run on a Ubuntu machine.`);
    process.exit(1);
  }

  const [, binaryName, ...args] = process.argv;

  const cli = new Cli({
    binaryLabel: `KernelTool for Ubuntu`,
    binaryName: path.basename(binaryName),
    binaryVersion: pkg.version
  });

  for (let cmd of commands) {
    cli.register(cmd);
  }

  cli.register(Builtins.HelpCommand);

  return cli.run(args);
}

await main();
