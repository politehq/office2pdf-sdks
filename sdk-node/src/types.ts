export type Office2PDFClientOptions = {
  apiKey: string;
  baseUrl?: string; // default: https://api.office2pdf.app
  timeoutMs?: number; // default: 120000
  userAgent?: string; // default: office2pdf-node/<version>
  maxRetries?: number; // default: 2
};

export type ConvertParams = {
  filePath: string;
  fileName?: string;
  output?: "pdf";
  password?: string;
  signal?: AbortSignal;

  downloadToPath?: string;
  asWebStream?: boolean;
};

export type ConvertResult =
  | {
      kind: "buffer";
      buffer: Buffer;
      contentType: string;
      requestId?: string;
    }
  | {
      kind: "downloaded";
      path: string;
      contentType: string;
      requestId?: string;
    }
  | {
      kind: "stream";
      stream: ReadableStream<Uint8Array>;
      contentType: string;
      requestId?: string;
    };
