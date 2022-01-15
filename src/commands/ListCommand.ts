import chalk from "chalk";
import CliTable from "cli-table";
import { Command, Option } from "clipanion";
import dayjs from "dayjs";
import semverCompare from "semver-compare";

import { KernelListing } from "../lib/repo.js";
import { BaseCommand } from "./BaseCommand.js";

export class ListCommand extends BaseCommand {
  static paths = [[`list`]];
  static usage = Command.Usage({
    description: "Display available kernels from the mainline repository.",
    examples: [
      ["List kernels from this year:", "$0 list"],
      ["List kernels released in 2019:", "$0 list --after 2019 --before 2020"]
    ]
  });

  json = Option.Boolean("-j,--json", { description: "Print as JSON object." });

  afterDate = Option.String("--after", { required: false, description: `After date, defaults to the beginning.` });

  beforeDate = Option.String("--before", { required: false, description: `Before date, defaults to now.` });

  archs = Option.Boolean("-A,--archs", { required: false, description: `Display kernel architectures.` });

  variants = Option.Boolean("-V,--variants", { required: false, description: `Display kernel variants.` });

  limit = Option.String("-l,--limit", {
    required: false,
    description: "How many entries to list, defaults to the latest 5 kernels."
  });

  async execute(): Promise<number> {
    const repo = await this.repo.reloadListings();
    let limit = this.limit ? parseInt(this.limit, 10) : 5;
    if (!isNaN(limit) || limit < 0) limit = 5;
    if (this.beforeDate && this.afterDate && !this.limit) limit = 1000;
    const now = new Date();
    const before = this.beforeDate ? Date.parse(this.beforeDate) : Date.now();
    const after = this.afterDate ? Date.parse(this.afterDate) : 0;
    if (!this.beforeDate && !this.afterDate && typeof this.limit === "undefined")
      process.stdout.write(
        chalk.blue.bold(
          `Displaying the 5 most recent kernels. Use the \`${chalk.white(`--before`)}\` and \`${chalk.white(
            `--after`
          )}\` arguments to control this behaviour.\n`
        )
      );
    let rows = Object.entries(repo.listings)
      .filter(([key, [url, date]]) => {
        return date.valueOf() >= after && date.valueOf() <= before;
      })
      .sort((a, b) => semverCompare(a[0], b[0]));
    if (rows.length === 0) {
      process.stderr.write(chalk.red("No kernels matching the given critera were found.\n"));
      return 1;
    }
    if (this.json) {
      const data = rows.map(([version]) => repo.populateKernelInfo(version));
      process.stdout.write(JSON.stringify(await Promise.all(data), null, 2));
    } else {
      const headers = ["Version", "Built"];
      const rowFns: ((data: [string, KernelListing]) => Promise<string>)[] = [
        async ([ver, [url, date]]) => ver,
        async ([ver, [url, date]]) =>
          date.getUTCFullYear() === now.getUTCFullYear()
            ? dayjs(date).format("MMM DD, HH:MM")
            : dayjs(date).format("MMM DD, YYYY")
      ];
      if (this.archs) {
        headers.push("Archs");
        rowFns.push(async ([ver, [url, date]]) => (await repo.populateKernelSummary(ver)).archs.join(", "));
      }
      if (this.variants) {
        headers.push("Variants");
        rowFns.push(async ([ver, [url, date]]) =>
          Array.from(
            new Set(
              Object.values((await repo.populateKernelInfo(ver, [this.systemArch])).archs).flatMap(a => a.variants)
            )
          ).join(", ")
        );
      }
      const table = new CliTable({ head: headers });
      const dispRows = await Promise.all(
        rows
          .slice(Math.max(rows.length - limit, 0), rows.length)
          .map(async rec => await Promise.all(rowFns.map(fn => fn(rec))))
      );
      table.push(...dispRows);
      console.log(table.toString());
    }
    return 0;
  }
}
