import { fetch, type Response as UndiciResponse } from "undici";
import type { BodyInit } from "undici";
import { FormData } from "formdata-node";
import { fileFromPath } from "formdata-node/file-from-path";
import { access, constants } from "node:fs/promises";
import path from "node:path";

import { Office2PDFError } from "./errors";
import type {
  ConvertParams,
  ConvertResult,
  Office2PDFClientOptions,
} from "./types";
import { getBackoffMs, isRetryAbleStatus, sleep, streamToFile } from "./utils";

/* -------------------------------- Constants ------------------------------- */

const DEFAULT_BASE_URL = "https://api.office2pdf.app";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;

/* ---------------------------------- Utils --------------------------------- */

function normalizeBaseUrl(baseUrl?: string): string {
  const url = (baseUrl || DEFAULT_BASE_URL).trim();
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function mapStatusToCode(status: number): Office2PDFError["code"] {
  const map: Record<number, Office2PDFError["code"]> = {
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    429: "RATE_LIMITED",
    413: "QUOTA_EXCEEDED",
  };

  if (map[status]) return map[status];
  if (status >= 400 && status < 500) return "INVALID_REQUEST";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

type JsonObject = Record<string, unknown>;

async function safeReadJson(res: UndiciResponse): Promise<JsonObject | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;

  try {
    return (await res.json()) as JsonObject;
  } catch {
    return null;
  }
}

function getRequestId(res: UndiciResponse): string | undefined {
  return (
    res.headers.get("x-request-id") ?? res.headers.get("cf-ray") ?? undefined
  );
}

/**
 * Merge multiple AbortSignals into one (Node 18 compatible).
 * Returns the merged signal and a cleanup function to avoid listener leaks.
 */
function mergeAbortSignals(...signals: (AbortSignal | undefined)[]): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  const active = signals.filter((s): s is AbortSignal => s != null);

  if (active.length === 0) {
    return { signal: undefined, cleanup: () => {} };
  }

  if (active.length === 1) {
    return { signal: active[0], cleanup: () => {} };
  }

  const aborted = active.find((s) => s.aborted);
  if (aborted) {
    return { signal: aborted, cleanup: () => {} };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  active.forEach((s) => s.addEventListener("abort", onAbort));

  return {
    signal: controller.signal,
    cleanup: () => {
      active.forEach((s) => s.removeEventListener("abort", onAbort));
    },
  };
}

function asBodyInit(body: unknown): BodyInit {
  return body as BodyInit;
}

/* --------------------------------- Client --------------------------------- */

/**
 * Official Office2PDF Node.js SDK client.
 *
 * @example
 * ```typescript
 * const client = new Office2PDF({ apiKey: "your-api-key" });
 *
 * // Get as buffer
 * const result = await client.convert({ filePath: "./document.docx" });
 * if (result.kind === "buffer") {
 *   fs.writeFileSync("output.pdf", result.buffer);
 * }
 *
 * // Download directly to file
 * await client.convert({
 *   filePath: "./document.docx",
 *   downloadToPath: "./output.pdf"
 * });
 * ```
 * Converts Office documents (DOCX, XLSX, PPTX) to PDF.
 * Authentication uses `x-api-key` header.
 */
export class Office2PDF {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly maxRetries: number;

  constructor(opts: Office2PDFClientOptions) {
    if (!opts?.apiKey?.trim()) {
      throw new Error("Office2PDF: apiKey is required");
    }

    this.apiKey = opts.apiKey.trim();
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = opts.userAgent ?? "office2pdf-node";
    this.maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
  }

  /**
   * Convert an Office document to PDF.
   */
  async convert(params: ConvertParams): Promise<ConvertResult> {
    await this.validateParams(params);

    const url = `${this.baseUrl}/api/pdf/preview`;
    let lastError: Office2PDFError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.sendConvertRequest(url, params);
      } catch (err) {
        const normalized = this.normalizeError(err);
        lastError = normalized;

        if (attempt < this.maxRetries && this.isRetryAble(normalized)) {
          await sleep(getBackoffMs(attempt));
          continue;
        }

        throw normalized;
      }
    }

    throw (
      lastError ??
      new Office2PDFError({
        message: "Unexpected conversion failure",
        code: "UNKNOWN",
      })
    );
  }

  /* ------------------------------ Internals ------------------------------ */

  private async validateParams(params: ConvertParams): Promise<void> {
    if (!params.filePath?.trim()) {
      throw new Office2PDFError({
        message: "filePath is required",
        code: "INVALID_REQUEST",
      });
    }

    try {
      await access(params.filePath, constants.R_OK);
    } catch {
      throw new Office2PDFError({
        message: `File not found or not readable: ${params.filePath}`,
        code: "INVALID_REQUEST",
      });
    }

    if (params.asWebStream && params.downloadToPath) {
      throw new Office2PDFError({
        message: "Cannot use asWebStream with downloadToPath",
        code: "INVALID_REQUEST",
      });
    }

    if (params.downloadToPath) {
      const dir = path.dirname(params.downloadToPath);
      if (dir && dir !== ".") {
        try {
          await access(dir, constants.W_OK);
        } catch {
          throw new Office2PDFError({
            message: `Download directory not writable: ${dir}`,
            code: "INVALID_REQUEST",
          });
        }
      }
    }
  }

  private async sendConvertRequest(
    url: string,
    params: ConvertParams
  ): Promise<ConvertResult> {
    const form = await this.buildFormData(params);

    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), this.timeoutMs);

    const merged = mergeAbortSignals(params.signal, timeoutCtrl.signal);

    try {
      const res = await fetch(url, {
        method: "POST",
        body: asBodyInit(form),
        headers: {
          "x-api-key": this.apiKey,
          "User-Agent": this.userAgent,
        },
        signal: merged.signal,
      });

      return await this.handleResponse(res, params);
    } finally {
      clearTimeout(timeoutId);
      merged.cleanup();
    }
  }

  private async buildFormData(params: ConvertParams): Promise<FormData> {
    const form = new FormData();
    const file = await fileFromPath(params.filePath, params.fileName);

    form.set("file", file);
    form.set("output", params.output ?? "pdf");

    if (params.password) {
      form.set("password", params.password);
    }

    return form;
  }

  private async handleResponse(
    res: UndiciResponse,
    params: ConvertParams
  ): Promise<ConvertResult> {
    const requestId = getRequestId(res);

    if (!res.ok) {
      const json = await safeReadJson(res);
      const message =
        typeof json?.message === "string"
          ? json.message
          : typeof json?.error_description === "string"
          ? json.error_description
          : `Request failed with status ${res.status}`;

      throw new Office2PDFError({
        message,
        code: mapStatusToCode(res.status),
        status: res.status,
        requestId,
        details: json ?? undefined,
      });
    }

    const contentType = res.headers.get("content-type") ?? "application/pdf";

    if (params.asWebStream) {
      if (!res.body) {
        throw new Office2PDFError({
          message: "Empty response body",
          code: "UNKNOWN",
          requestId,
        });
      }

      return {
        kind: "stream",
        stream: res.body,
        contentType,
        requestId,
      };
    }

    if (params.downloadToPath) {
      if (!res.body) {
        throw new Office2PDFError({
          message: "Empty response body",
          code: "UNKNOWN",
          requestId,
        });
      }

      await streamToFile(res.body, params.downloadToPath);

      return {
        kind: "downloaded",
        path: params.downloadToPath,
        contentType,
        requestId,
      };
    }

    const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));

    return {
      kind: "buffer",
      buffer,
      contentType,
      requestId,
    };
  }

  private normalizeError(err: unknown): Office2PDFError {
    if (err instanceof Office2PDFError) return err;

    if (err instanceof DOMException && err.name === "AbortError") {
      return new Office2PDFError({
        message: "Request timed out",
        code: "TIMEOUT",
      });
    }

    if (err instanceof Error) {
      return new Office2PDFError({
        message: err.message,
        code: "NETWORK_ERROR",
        details: { name: err.name },
      });
    }

    return new Office2PDFError({
      message: "Unknown error",
      code: "UNKNOWN",
      details: err,
    });
  }

  private isRetryAble(error: Office2PDFError): boolean {
    if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
      return true;
    }

    if (error.status && isRetryAbleStatus(error.status)) {
      return true;
    }

    return false;
  }
}
