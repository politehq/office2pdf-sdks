# office2pdf (Node.js)

Official Node.js SDK for the Office2PDF API.

## Install

npm i office2pdf

## Usage

```ts
import { Office2PDF } from "office2pdf";
import fs from "node:fs";

const client = new Office2PDF({ apiKey: process.env.OFFICE2PDF_API_KEY! });

const r = await client.convert({
  filePath: "./input.docx",
  downloadToPath: "./output.pdf",
});

console.log("Saved:", r.kind === "downloaded" ? r.path : "OK");
```

If you prefer an in-memory buffer:

```ts
const r = await client.convert({ filePath: "./input.docx" });
if (r.kind === "buffer") fs.writeFileSync("./output.pdf", r.buffer);
```
