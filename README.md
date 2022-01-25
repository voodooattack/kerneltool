[![npm version](https://badge.fury.io/js/kerneltool.svg)](https://badge.fury.io/js/kerneltool)

# Ubuntu Kernel Tool

A tool to list, download, and install mainline kernels from the Ubuntu [mainline repository](https://kernel.ubuntu.com/~kernel-ppa/mainline/).

#### ULTIMATE DISCLAIMER: DO NOT USE THIS TOOL UNLESS YOU KNOW WHAT YOU'RE DOING. USE AT YOUR OWN RISK!

As stated in the [Ubuntu Wiki](https://wiki.ubuntu.com/Kernel/MainlineBuilds):

> *By default, Ubuntu systems run with the Ubuntu kernels provided by the Ubuntu repositories. However it is handy to be able to test with unmodified upstream kernels to help locate problems in Ubuntu kernel patches, or to confirm that upstream has fixed a specific issue. To this end we now offer select upstream kernel builds. These kernels are made from unmodified kernel source but using the Ubuntu kernel configuration files. These are then packaged as Ubuntu .deb files for simple installation, saving you the time of compiling kernels, and debugging build issues.*
>
> **These kernels are not supported and are not appropriate for production use.**


![Animated preview](./preview/kerneltool.webp)

This tool was funded with copious amounts of coffee. If you think it has helped you, and you're feeling generous, you can always [<img alt="buy me another coffee!" align="middle" src="https://img.buymeacoffee.com/button-api/?text=buy%20me%20another%20coffee%21&emoji=&slug=voodooattack&button_colour=FFDD00&font_colour=000000&font_family=Bree&outline_colour=000000&coffee_colour=ffffff" height="32"></img>](https://www.buymeacoffee.com/voodooattack)

## Stability

This tool was put together in two days. I've done my utmost to make it easy to use and to not have it butcher your system in any way, but please note that my official statement is that this tool *only works on my machine™* until further notice.

Due to the nature of this tool, testing with multiple unique installations (undoubtedly like your own since you're looking into this) is practically impossible. Although I'm always open to suggestions, and your feedback is always welcome.

## Requirements:

This tool requires a recent version of [Node.js](https://nodejs.org) to run.

It has been tested with the current LTS release (v16.13.2) and the latest release (v17.xx).

### Running

You need npm on your system.

To run this tool on-the fly, invoke `npx kerneltool [command...]`.

Alternatively, invoke `sudo npm install -g kerneltool` to install it globally on your system. (not recommended)

### Usage

```
━━━ KernelTool for Ubuntu - 1.0.1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  $ kerneltool <command>

━━━ General commands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  kerneltool cache clear
    Clears the cache.

  kerneltool cache inspect
    Inspects the cache.

  kerneltool clone [--repo #0] [--git-repo #0] <kernel> <directory>
    Clone the source code for a specific kernel version to a directory.

  kerneltool download [--repo #0] [-v,--variant #0] [-a,--arch #0] [-o,--overwrite] <kernel> [directory]
    Download a specific kernel version to the cache. Will optionally copy the .deb packages to an output directory.

  kerneltool install [--repo #0] [-y,--yes] <kernel> [variant]
    Install a specific kernel version. This command requires root privileges.

  kerneltool list [--repo #0] [-j,--json] [--after #0] [--before #0] [-A,--archs] [-V,--variants] [-l,--limit #0]
    Display available kernels from the mainline repository.

  kerneltool show [--repo #0] [-j,--json] [-a,--arch #0] [--all] <kernel>
    Show the information for a specific kernel version.

You can also print more details about any of these commands by calling them with 
the `-h,--help` flag right after the command name.
```

Additional notes:
- The only command to require root privileges is `kerneltool install`. Everything else can be run by a normal user.
- The cache is not shared amongst users. Running `kerneltool download [kernel]` as a user and later running `sudo kerneltool install [kernel]` (as root) will re-download all files from scratch.

### A special note about kernels 5.16.x:

Kernel 5.16.x from the mainline repo will not install automatically. You need the `libssl3` package on your system, and that's not currently available for Impish (21.10).

To install the kernel, make sure you install the `.deb` package manually from [jammy](https://packages.ubuntu.com/jammy/libssl3) first. It works on 21.10 without issue.

A special note for NVIDIA users:

*Kernel 5.16.x will not work with the NVIDIA dkms package at the moment. You'll have to edit/patch the NVIDIA dkms files first. See this [thread](https://bbs.archlinux.org/viewtopic.php?id=271400) for more details.*

As per the suggestion from that thread: adding the following near the top of `/usr/src/nvidia-495.46/nvidia-uvm/uvm_migrate.c` after all the `#include` statements fixed it for me.

```c
#ifndef MIGRATE_PFN_LOCKED
#define MIGRATE_PFN_LOCKED 0
#endif
```

P.S: *And yes! It's absolutely worth it. My steam games run so much faster and smoother now.*

### Contributing

All contributions are welcome. If you find a problem running it on your system and manage to fix it, please submit a PR.

*P.S. Any PRs that touch [this line of code](./src/lib/repo.ts#L101) will be rejected with extreme prejudice.*

### License (MIT)

```
Copyright 2022 Abdullah Ali

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```