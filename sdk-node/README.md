# office2pdf (Node.js)

Official Node.js SDK for the Office2PDF API.

![npm](https://img.shields.io/npm/v/@politehq/office2pdf)
![downloads](https://img.shields.io/npm/dm/@politehq/office2pdf)
![license](https://img.shields.io/npm/l/@politehq/office2pdf)

Convert Word, Excel, and PowerPoint documents to PDF with a simple, production-ready API.

---

## Requirements

- Node.js **>= 18**
- An Office2PDF API key

Authentication is done via the `x-api-key` request header.

---

## Install

```bash
npm install @politehq/office2pdf
```

---

## Quick start

```ts
import { Office2PDF } from "@politehq/office2pdf";

const client = new Office2PDF({
  apiKey: process.env.OFFICE2PDF_API_KEY!,
});
```

---

## Convert and download to file (recommended)

For production workloads and large documents, always download directly to disk.

```ts
const result = await client.convert({
  filePath: "./input.docx",
  downloadToPath: "./output.pdf",
});

console.log("Saved to:", result.path);
```

---

## Convert to in-memory buffer

Suitable for small files or quick scripts.

```ts
import fs from "node:fs";

const result = await client.convert({
  filePath: "./input.docx",
});

if (result.kind === "buffer") {
  fs.writeFileSync("./output.pdf", result.buffer);
}
```

---

## Streaming output

For advanced use-cases, you can receive a Web ReadableStream.

```ts
const result = await client.convert({
  filePath: "./input.docx",
  asWebStream: true,
});

if (result.kind === "stream") {
  // pipe or process the stream
}
```

---

## Error handling

All errors are thrown as `Office2PDFError` with stable error codes.

```ts
import { Office2PDFError } from "office2pdf";

try {
  await client.convert({ filePath: "./input.docx" });
} catch (e) {
  if (e instanceof Office2PDFError) {
    console.error(e.code, e.message, e.requestId);
  }
}
```

Common error codes include:

- `UNAUTHORIZED`
- `INVALID_REQUEST`
- `RATE_LIMITED`
- `QUOTA_EXCEEDED`
- `TIMEOUT`
- `SERVER_ERROR`

---

## Notes

- For large files, prefer `downloadToPath` or `asWebStream`
- Automatic retries are applied for retryable errors (429, 5xx, network issues)
- Memory usage is kept stable for production workloads

---

## License

MIT
