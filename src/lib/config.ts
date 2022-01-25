import envPaths from "env-paths";
import { createRequire } from "module"; // Bring in the ability to create the 'require' method

const require = createRequire(import.meta.url); // construct the require method

export const pkg = require("../../package.json");
export const UBUNTU_MAINLINE_URL = "https://kernel.ubuntu.com/~kernel-ppa/mainline";
export const UBUNTU_MAINLINE_GIT =
  "git://git.launchpad.net/~ubuntu-kernel-test/ubuntu/+source/linux/+git/mainline-crack";
export const appPaths = envPaths(pkg.name);
