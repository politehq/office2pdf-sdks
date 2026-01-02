# Office2PDF SDKs

![Official SDK](https://img.shields.io/badge/Official-SDK%20by%20Office2PDF-2563eb)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success)

Official SDKs for the **Office2PDF API**.  
Convert Word, Excel, and PowerPoint documents to PDF securely using production-ready clients for **Node.js, Python, Go, and Java/Kotlin**.

These SDKs are designed for real production use, with support for large files, streaming uploads and downloads, retries, and consistent error handling across languages.

---

## What is Office2PDF?

Office2PDF is a simple and secure API for converting Office documents (DOCX, XLSX, PPTX) into PDF.

The API is built for backend systems and automation workflows where reliability, performance, and data safety matter.

Website: https://office2pdf.app

---

## Supported SDKs

This repository contains the official SDKs maintained by the Office2PDF team.

- Node.js (TypeScript)
- Python
- Go
- Java / Kotlin

Each SDK follows the same API conventions and error model to ensure a consistent developer experience across languages.

---

## Authentication

All requests are authenticated using an API key.

The API key must be sent via the `x-api-key` header:

x-api-key: YOUR_API_KEY

API keys can be created and managed from the Office2PDF dashboard.

---

## Quick Example (Node.js)

```ts
import { Office2PDF } from "@politehq/office2pdf";
import fs from "fs";

const client = new Office2PDF({
  apiKey: process.env.OFFICE2PDF_API_KEY,
});

const result = await client.convert({
  filePath: "./input.docx",
  downloadToPath: "./output.pdf",
});

console.log("PDF saved to:", result.path);
```

For large files, downloading directly to disk is recommended to avoid excessive memory usage.

---

## Handling Large Files

All SDKs support streaming downloads and disk-based processing for large files.

For production workloads and large documents, you should always use the streaming response or downloadToPath / ConvertToFile APIs provided by each SDK. This avoids loading large PDFs into memory and ensures stable and predictable performance.

---

## Error Handling

All SDKs return structured errors with the same shape and semantics.

Each error includes:

- A stable error code
- A human-readable message
- HTTP status (when applicable)
- A request ID for debugging and support

Example error codes include:

- UNAUTHORIZED
- INVALID_REQUEST
- RATE_LIMITED
- QUOTA_EXCEEDED
- SERVER_ERROR

This makes it easy to implement consistent retry and fallback logic across services.

---

## Security & Data Handling

Files are processed transiently for conversion purposes only.

Office2PDF does not permanently store uploaded documents. Once conversion is completed, files are discarded according to the service’s data handling policy.

If you discover a potential security issue, please report it responsibly. See `SECURITY.md` for details.

---

## Versioning

SDKs follow semantic versioning.

Breaking changes will only be introduced in major versions, and API compatibility is treated as a priority.

---

## Support

For documentation, usage examples, and API reference, visit:

https://office2pdf.app/docs/api

For support or questions related to the SDKs, please open a GitHub issue.

---

## License

This project is licensed under the MIT License.
