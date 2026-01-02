import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRetryAbleStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function getBackoffMs(attempt: number): number {
  const base = 300 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

export async function streamToFile(
  webStream: ReadableStream<Uint8Array>,
  outPath: string
): Promise<void> {
  const nodeReadable = Readable.fromWeb(webStream);
  const ws = createWriteStream(outPath);
  await pipeline(nodeReadable, ws);
}
