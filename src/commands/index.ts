import { CacheClearCommand, CacheInspectCommand } from "./CacheCommands.js";
import { DownloadCommand } from "./DownloadCommand.js";
import { InstallCommand } from "./InstallCommand.js";
import { ListCommand } from "./ListCommand.js";
import { ShowCommand } from "./ShowCommand.js";

export default [ListCommand, ShowCommand, DownloadCommand, InstallCommand, CacheClearCommand, CacheInspectCommand];
