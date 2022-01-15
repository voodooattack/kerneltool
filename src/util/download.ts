import fetch, { RequestInfo, RequestInit } from "node-fetch";
import * as crypto from "node:crypto";

import { Transfer, TransferStats } from "./stats.js";

export type DownloadProgressData = TransferStats & {
  url: string;
  id: string;
};

export type DownloadProgressFunction = (data: DownloadProgressData) => void;

export type DownloadOptions = {
  url: RequestInfo;
  progress?: DownloadProgressFunction;
  init?: RequestInit;
};

export class DownloadError extends Error {
  constructor(message: string, public code: number, public url: string) {
    super(`Error fetching ${url}: ${code} ${message}`);
  }
}

export async function download(options: DownloadOptions) {
  const id = crypto.randomUUID();
  const res = await fetch(options.url, options.init);
  if (!res.ok) throw new DownloadError(res.statusText, res.status, res.url);
  if (options.progress && res.body) {
    const size = res.headers.has("content-length") ? parseInt(res.headers.get("content-length")!, 10) : res.size;
    let transfer = new Transfer({ bytesTotal: size });
    transfer.start();
    res.body.on("data", chunk => {
      transfer.updateBytes(transfer.bytesCompleted + chunk.length);
      options.progress!({
        ...transfer.stats,
        id,
        url: res.url
      });
    });
    res.body.on("close", () => {
      transfer.finish();
      options.progress!({
        ...transfer.stats,
        id,
        url: res.url
      });
    });
  }
  return res;
}
