import chalk from "chalk";
import CliTable from "cli-table";
import { Command, Option } from "clipanion";
import dayjs from "dayjs";

import { BaseCommand } from "./BaseCommand.js";

export class ShowCommand extends BaseCommand {
  static paths = [[`show`]];
  static usage = Command.Usage({
    description: "Show the information for a specific kernel version.",
    examples: [["Show information about a specific kernel:", "$0 show 5.13"]]
  });

  json = Option.Boolean("-j,--json", { description: "Print as JSON object." });

  kernelVersion = Option.String({ name: "kernel", required: true });

  archs = Option.Array("-a,--arch", {
    required: false,
    description: `Binary architectures to match. Defaults to "${this.systemArch}" on this machine. You may pass this option multiple times.`
  });

  all = Option.Boolean("--all", { required: false, description: "List all architectures." });

  override async execute(): Promise<number> {
    await this.repo.reloadListings();
    let archs = this.archs ?? [this.systemArch];
    if (this.all) {
      const summary = await this.repo.populateKernelSummary(this.kernelVersion);
      archs = summary.archs;
    }
    const info = await this.repo.populateKernelInfo(this.kernelVersion, archs);
    if (this.json) console.log(JSON.stringify(info, null, 2));
    else {
      const table = new CliTable({});
      const variantTableEnabled = Object.create(null);
      const variantTableRows = archs.map(a => [
        a,
        info.archs[a].variants
          .map(variant => {
            if (info.archs[a].packages[variant].files.image) {
              variantTableEnabled["signed"] = true;
              variant = chalk.green(variant);
            } else if (info.archs[a].packages[variant].files.imageUnsigned) {
              variantTableEnabled["unsigned"] = true;
              variant = chalk.yellow(variant);
            } else {
              variantTableEnabled["missing"] = true;
              variant = chalk.red(variant);
            }
            return `${variant}`;
          })
          .join(", ")
      ]);
      const variantTable = new CliTable({
        head: [
          chalk.white.bold`Image`,
          chalk.reset.white(
            chalk.white.bold`Variants` +
              " (" +
              [
                "signed" in variantTableEnabled && chalk.green`signed`,
                "unsigned" in variantTableEnabled && chalk.yellow`unsigned`,
                "missing" in variantTableEnabled && chalk.red`missing`
              ]
                .filter(v => !!v)
                .join(" - ") +
              ")"
          )
        ],
        style: { compact: true },
        colors: true
      });
      variantTable.push(...variantTableRows);
      const rows = [
        ["Kernel", info.version],
        ["Built on", dayjs(info.date).format("DD MMM YYYY, HH:MM:SS")],
        ["Images", (info.summary?.archs ?? []).join(", ")],
        ["Details", `${variantTable.toString()}`]
      ];
      table.push(...rows);
      console.log(table.toString());
    }
    return 0;
  }
}
