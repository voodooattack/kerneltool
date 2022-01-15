import moize from "moize";
import { parse } from "node-html-parser";
import * as path from "node:path";
import semver from "semver";
import yaml from "yaml";

import { download, DownloadProgressFunction } from "../util/download.js";
import { UBUNTU_MAINLINE_URL } from "./config.js";

export type Dict<T> = {
  [key: string]: T;
};

export type KernelListing = [url: string, releaseDate: Date];
export type KernelListings = Dict<KernelListing>;

export type KernelSummary = {
  host: string;
  archs: string[];
  series: string;
  commit: string;
  commitLabel: string;
  commitTitle: string;
  commitTime: Date;
  commitHash: string;
  startTime: Date;
  endTime: Date;
  listingUrl: string;
  summaryUrl: string;
};

const enum PackageTypes {
  Headers = "linux-headers",
  Image = "linux-image",
  ImageUnsigned = "linux-image-unsigned",
  Modules = "linux-modules"
}

export type PackageInfo = {
  version: string; // 5.16.0
  arch: string; // amd64
  packageFullName: string; //'linux-modules-5.16.0-051600-generic',
  packageLabel?: string; //'051600',
  variant?: string; //'generic',
  deb: string; //'linux-modules-5.16.0-051600-generic_5.16.0-051600.202201091830_amd64.deb',
  fullTag: string; //'051600.202201091830',
  debLabel: string; //'051600',
  debTag: string; //'202201091830'
  debUrl: string;
  sha1?: string;
  sha256?: string;
  hash: string;
};

export type Variant = {
  name: string;
  files: {
    headers?: PackageInfo[];
    modules?: PackageInfo;
    image?: PackageInfo;
    imageUnsigned?: PackageInfo;
  };
};

export type ArchInfo = {
  name: string;
  variants: string[];
  packages: Dict<Variant>;
};

export type KernelInfo = {
  version: string;
  url: string;
  date: Date;
  summary?: KernelSummary;
  archs: Dict<ArchInfo>;
};

export type PackageRegexBuildOptions = {
  version?: string;
  arch?: string;
  flags?: string;
};

export const buildKernelPackageRegex = moize(function buildPackageRegex(
  name: string = ".*?",
  options?: PackageRegexBuildOptions
): RegExp {
  const verIdent =
    typeof options?.version === "undefined"
      ? "(?:\\d+\\.\\d+\\.\\d+)"
      : semver.coerce(options.version)!.toString().replaceAll(".", "\\.");
  const archIdent = options?.arch?.replaceAll?.(".", "\\.") ?? ".*?";
  /**
   * Behold! For I have ascended!
   * Don't you fucking dare change a single character of this string
   * Any pull requests that try to change this will be DENIED
   * Also I think this regular expression is selfaware
   */
  // prettier-ignore
  const checksumWithPackageRegex = `((?<sha256>[0-9A-Fa-f]{64})|(?<sha1>[0-9A-Fa-f]{40}))\\s*(?<deb>(?<packageFullName>${name}-(?<version>(?:${verIdent}))(?:-(?:(?<packageLabel>.+?)(?:-(?<variant>.+?))?))?)_(?:\\d+\\.\\d+\\.\\d+)-(?<debTag>((?<debLabel>\\d+)|\\k<packageLabel>).(?<tag>\\d+))_(?<arch>${archIdent}).deb)`;
  return new RegExp(checksumWithPackageRegex, options?.flags ?? "m");
});

export class MainlineRepo {
  listings: KernelListings = Object.create(null);
  info: { [version: string]: KernelInfo } = Object.create(null);

  constructor(public url: string = UBUNTU_MAINLINE_URL, public progress?: DownloadProgressFunction) {
    this.readRemoteText = moize(this.readRemoteText.bind(this));
  }

  async reloadListings(): Promise<this> {
    const { url } = this;
    const html = await this.readRemoteText(url);
    const doc = parse(html);
    const anchors = doc.querySelectorAll("a");
    this.listings = Object.fromEntries(
      anchors
        .map(a => [a.getAttribute("href"), a.parentNode?.nextSibling?.innerText])
        .filter(
          ([href, date]) => href && date && /v\d+[\.]\d+(\.\d+)?-?.*/.test(href) && href.indexOf("dontuse") === -1
        )
        .map(([href, date]) => [
          href!.replaceAll(/^v|\/$/g, ""),
          [path.join(url, href!), date ? new Date(date) : new Date(0)]
        ])
    );
    Object.entries(this.listings).forEach(([version, [url, date]]) => {
      this.info[version] ?? (this.info[version] = { version, url, date, archs: Object.create(null) });
    });
    return this;
  }

  async populateKernelInfo(version: string, archs?: string[], throwError?: boolean): Promise<KernelInfo> {
    const [url, date] = this.listings[version] ?? [];
    const kernelInfo = this.info[version] ?? (this.info[version] = { version, url, date, archs: Object.create(null) });
    if (!kernelInfo.date) kernelInfo.date = date;
    if (!url) {
      throw new Error(`Kernel ${version} not found.`);
    }
    try {
      await this.populateKernelSummary(kernelInfo);
      await Promise.all(
        (archs ?? kernelInfo.summary!.archs).map(async arch => {
          try {
            return await this.populateKernelArchInfo(kernelInfo, arch);
          } catch (e) {
            if (throwError)
              // console.error(`Error getting kernel info for ${version} and arch ${arch}:`, e);
              /*else*/ throw e;
          }
        })
      );
    } catch (e: any) {
      if (!throwError) console.error(`Error getting kernel info for ${version}:`, e);
      else throw e;
    }
    return kernelInfo;
  }

  async readRemoteText(url: string): Promise<string> {
    const res = await download({ url, progress: this.progress });
    return await res.text();
  }

  async populateKernelSummary(infoOrVersion: KernelInfo | string): Promise<KernelSummary> {
    const info: KernelInfo = typeof infoOrVersion === "string" ? this.info[infoOrVersion] : infoOrVersion;
    if (info.summary) return info.summary!;
    const url = info.url;
    const summaryUrl = path.join(url, "summary.yaml");
    const text = await this.readRemoteText(summaryUrl);
    const data = yaml.parse(text);
    const remappedKeys: { [id in keyof KernelSummary]?: string } = {
      host: "build-host",
      archs: "testsets",
      commitLabel: "commit-label",
      commitTitle: "commit-title",
      commitTime: "commit-time",
      commitHash: "commit-hash",
      startTime: "start-time",
      endTime: "end-time",
      series: "series",
      commit: "commit"
    };
    const summary: KernelSummary = Object.assign(
      Object.fromEntries(
        Object.entries(remappedKeys).map(([targetKey, sourceKey]) => [targetKey, data[sourceKey]])
      ) as KernelSummary,
      { summaryUrl, listingUrl: url }
    );
    info.summary = summary;
    return summary;
  }

  async populateKernelArchInfo(infoOrVersion: KernelInfo | string, arch: string) {
    const info: KernelInfo = typeof infoOrVersion === "string" ? this.info[infoOrVersion] : infoOrVersion;
    const archInfo =
      info.archs?.[arch] ?? (info.archs[arch] = { name: arch, packages: Object.create(null), variants: [] });
    const url = info.url;
    const checksumsUrl = path.join(url, arch, "CHECKSUMS");
    const checksumsText = await this.readRemoteText(checksumsUrl);
    const getPackageInfo = (re: RegExp): PackageInfo | PackageInfo[] | undefined => {
      if (re.global)
        return Array.from(checksumsText.matchAll(re)).map(v => {
          const info = v.groups as PackageInfo;
          if (info) info.debUrl = path.join(url, arch, info.deb);
          return info;
        });
      const info = checksumsText.match(re)?.groups as PackageInfo;
      if (info) info.debUrl = path.join(url, arch, info.deb);
      if (!info.sha256 && !info.sha1)
        throw new Error(`Could not determine checksum of package "${info.packageFullName}".`);
      info.hash = info.sha256
        ? `sha256-${Buffer.from(info.sha256, "hex").toString("base64")}`
        : `sha1-${Buffer.from(info.sha1!, "hex").toString("base64")}`;
      return info;
    };

    const buildRe = (type: PackageTypes, all = false) =>
      buildKernelPackageRegex(type, {
        version: info.version,
        arch: all ? undefined : arch,
        flags: "gm"
      });

    const populate = (type: keyof Variant["files"], packages: PackageInfo[], appendMode?: boolean) => {
      for (let pkg of packages) {
        const variantName = pkg.variant ?? "all";
        if (pkg.variant) archInfo.variants = Array.from(new Set([...archInfo.variants, variantName]));
        const listings =
          archInfo.packages[variantName] ??
          (archInfo.packages[variantName] = { name: variantName, files: Object.create(null) });
        const fileOrFiles = listings.files[type] ?? (listings.files[type] = appendMode ? [] : Object.create(null));
        if (!appendMode) {
          Object.assign(fileOrFiles, pkg);
        } else {
          const prev = fileOrFiles.find((a: PackageInfo) => a.packageFullName === pkg.packageFullName);
          if (!prev) fileOrFiles.push({ ...pkg });
          else Object.assign(prev, pkg);
        }
      }
    };

    const headersPackageRegex = buildRe(PackageTypes.Headers, true);
    const modulesPackageRegex = buildRe(PackageTypes.Modules);
    const imagePackageRegex = buildRe(PackageTypes.Image);
    const unsignedImagePackageRegex = buildRe(PackageTypes.ImageUnsigned);

    const headers = getPackageInfo(headersPackageRegex) as PackageInfo[];
    const modules = getPackageInfo(modulesPackageRegex) as PackageInfo[];
    const image = getPackageInfo(imagePackageRegex) as PackageInfo[];
    const unsignedImage = getPackageInfo(unsignedImagePackageRegex) as PackageInfo[];

    populate("headers", headers, true);
    populate("modules", modules);
    populate("image", image);
    populate("imageUnsigned", unsignedImage);

    for (let v of archInfo.variants) {
      archInfo.packages[v].files.headers?.push?.(...(archInfo.packages["all"]?.files?.headers ?? []));
    }

    return info;
  }
}
