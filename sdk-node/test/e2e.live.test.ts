import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { Office2PDF } from "../src/index.js";

const apiKey = process.env.OFFICE2PDF_API_KEY || "dummy-api-key";
const baseUrl = process.env.OFFICE2PDF_BASE_URL || "https://api.office2pdf.app";

describe("E2E (live) Office2PDF API", () => {
  it.runIf(!!apiKey)("converts a DOCX to PDF (downloadToPath)", async () => {
    const client = new Office2PDF({
      apiKey: apiKey!,
      baseUrl,
      timeoutMs: 120_000,
      maxRetries: 1,
    });
    // sample.docx is a minimal DOCX (~10KB) committed for E2E testing only
    const fixture = path.join(process.cwd(), "test/fixtures/sample.docx");
    expect(fs.existsSync(fixture)).toBe(true);

    const outPath = path.join(os.tmpdir(), `office2pdf-e2e-${Date.now()}.pdf`);

    const r = await client.convert({
      filePath: fixture,
      downloadToPath: outPath,
    });

    expect(r.kind).toBe("downloaded");

    const bytes = fs.readFileSync(outPath);
    // PDF signature
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    fs.unlinkSync(outPath);
  });

  it.runIf(!!apiKey)("returns structured error for invalid file", async () => {
    const client = new Office2PDF({
      apiKey: apiKey!,
      baseUrl,
      timeoutMs: 60_000,
      maxRetries: 0,
    });

    const tmp = path.join(os.tmpdir(), `office2pdf-e2e-${Date.now()}.bin`);
    fs.writeFileSync(tmp, Buffer.from("not a docx"));

    await expect(client.convert({ filePath: tmp })).rejects.toMatchObject({
      name: "Office2PDFError",
    });

    fs.unlinkSync(tmp);
  });
});
