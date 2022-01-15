import cacache from "cacache";
import { Response, Request } from "node-fetch";
import { pipeline } from "node:stream/promises";

import { appPaths } from "../lib/config.js";
import { download, DownloadOptions } from "./download.js";

export async function downloadFromCache(
  options: DownloadOptions,
  hash?: string
): Promise<[response: Response | null, stream: NodeJS.ReadableStream]> {
  const url = options.url instanceof Request ? options.url.url : options.url;
  const info = await cacache.get.info(appPaths.cache, url);
  if (info) {
    let cachedStream = await cacache.get.stream(appPaths.cache, url, {
      integrity: hash
    });
    return [null, cachedStream];
  }
  let outputStream = cacache.put.stream(appPaths.cache, url, {
    algorithms: ["sha256"],
    integrity: hash
  });
  let res = await download(options);
  await pipeline([res.body!, outputStream]);
  let cachedStream = cacache.get.stream(appPaths.cache, url, { integrity: hash });
  return [res, cachedStream];
}
