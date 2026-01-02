import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { Office2PDF, Office2PDFError } from "../src/index.js";

function tmpFile(name: string) {
  return path.join(
    os.tmpdir(),
    `office2pdf-sdk-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}-${name}`
  );
}

async function writeDummyInput(p: string) {
  await fsp.writeFile(p, Buffer.from("dummy input"));
}

describe("Office2PDF Node SDK", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect(); // ensure no real network
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    // Best-effort cleanup: undici mock agent
    await agent.close();
  });

  it("throws if apiKey missing", () => {
    expect(() => new Office2PDF({ apiKey: "" as string })).toThrow();
  });

  it("sends x-api-key header and returns buffer on success", async () => {
    const client = new Office2PDF({
      apiKey: "op2p_test_123",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 5_000,
      maxRetries: 0,
    });

    const inputPath = tmpFile("input.docx");
    await writeDummyInput(inputPath);

    const pdfBytes = Buffer.from("%PDF-1.4 dummy");

    const pool = agent.get("https://api.office2pdf.app");

    pool
      .intercept({
        method: "POST",
        path: "/api/pdf/preview",
        headers: {
          "x-api-key": "op2p_test_123",
        },
      })
      .reply(200, pdfBytes, {
        headers: {
          "content-type": "application/pdf",
          "x-request-id": "rid_1",
        },
      });

    const res = await client.convert({ filePath: inputPath });
    expect(res.kind).toBe("buffer");
    if (res.kind === "buffer") {
      expect(res.buffer.toString()).toBe(pdfBytes.toString());
      expect(res.contentType).toContain("application/pdf");
      expect(res.requestId).toBe("rid_1");
    }

    await fsp.unlink(inputPath);
  });

  it("downloads to file when downloadToPath is set", async () => {
    const client = new Office2PDF({
      apiKey: "op2p_test_123",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 5_000,
      maxRetries: 0,
    });

    const inputPath = tmpFile("input.pptx");
    const outPath = tmpFile("out.pdf");
    await writeDummyInput(inputPath);

    const pdfBytes = Buffer.from("%PDF-1.4 downloaded");

    const pool = agent.get("https://api.office2pdf.app");
    pool
      .intercept({
        method: "POST",
        path: "/api/pdf/preview",
      })
      .reply(200, pdfBytes, {
        headers: {
          "content-type": "application/pdf",
          "x-request-id": "rid_2",
        },
      });

    const res = await client.convert({
      filePath: inputPath,
      downloadToPath: outPath,
    });

    expect(res.kind).toBe("downloaded");
    if (res.kind === "downloaded") {
      expect(res.path).toBe(outPath);
      expect(res.requestId).toBe("rid_2");
    }

    const saved = await fsp.readFile(outPath);
    expect(saved.toString()).toBe(pdfBytes.toString());

    await Promise.allSettled([fsp.unlink(inputPath), fsp.unlink(outPath)]);
  });

  it("maps 401 to UNAUTHORIZED", async () => {
    const client = new Office2PDF({
      apiKey: "bad_key",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 5_000,
      maxRetries: 0,
    });

    const inputPath = tmpFile("input.xlsx");
    await writeDummyInput(inputPath);

    const pool = agent.get("https://api.office2pdf.app");
    pool.intercept({ method: "POST", path: "/api/pdf/preview" }).reply(
      401,
      { error: "UNAUTHORIZED", message: "Invalid API key" },
      {
        headers: {
          "content-type": "application/json",
          "x-request-id": "rid_401",
        },
      }
    );

    await expect(client.convert({ filePath: inputPath })).rejects.toMatchObject(
      {
        name: "Office2PDFError",
        code: "UNAUTHORIZED",
        status: 401,
        requestId: "rid_401",
      }
    );

    await fsp.unlink(inputPath);
  });

  it("maps 429 to RATE_LIMITED and retries", async () => {
    const client = new Office2PDF({
      apiKey: "op2p_test_123",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 5_000,
      maxRetries: 1,
    });

    const inputPath = tmpFile("input.docx");
    await writeDummyInput(inputPath);

    const pdfBytes = Buffer.from("%PDF-1.4 after retry");

    const pool = agent.get("https://api.office2pdf.app");

    // First call: 429
    pool.intercept({ method: "POST", path: "/api/pdf/preview" }).reply(
      429,
      { error: "RATE_LIMITED", message: "Busy" },
      {
        headers: {
          "content-type": "application/json",
          "x-request-id": "rid_429",
        },
      }
    );

    // Second call: success
    pool
      .intercept({ method: "POST", path: "/api/pdf/preview" })
      .reply(200, pdfBytes, {
        headers: {
          "content-type": "application/pdf",
          "x-request-id": "rid_ok",
        },
      });

    const res = await client.convert({ filePath: inputPath });
    expect(res.kind).toBe("buffer");
    if (res.kind === "buffer") {
      expect(res.requestId).toBe("rid_ok");
    }

    await fsp.unlink(inputPath);
  });

  it("throws TIMEOUT when request exceeds timeout", async () => {
    const client = new Office2PDF({
      apiKey: "op2p_test_123",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 10, // very small
      maxRetries: 0,
    });

    const inputPath = tmpFile("input.docx");
    await writeDummyInput(inputPath);

    const pool = agent.get("https://api.office2pdf.app");
    pool
      .intercept({ method: "POST", path: "/api/pdf/preview" })
      .reply(200, async () => {
        // Simulate a slow server
        await new Promise((r) => setTimeout(r, 100));
        return Buffer.from("%PDF late");
      });

    await expect(client.convert({ filePath: inputPath })).rejects.toMatchObject(
      {
        name: "Office2PDFError",
        code: "TIMEOUT",
      }
    );

    await fsp.unlink(inputPath);
  });

  it("maps 413 to QUOTA_EXCEEDED (plan file size limit)", async () => {
    const client = new Office2PDF({
      apiKey: "op2p_test_123",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 5_000,
      maxRetries: 0,
    });

    const inputPath = tmpFile("big.docx");
    await writeDummyInput(inputPath);

    const pool = agent.get("https://api.office2pdf.app");
    pool.intercept({ method: "POST", path: "/api/pdf/preview" }).reply(
      413,
      {
        // backend hiện tại của bạn
        error: "FILE_TOO_LARGE",
        plan: "free",
        maxMB: 10,
      },
      {
        headers: {
          "content-type": "application/json",
          "x-request-id": "rid_413",
        },
      }
    );

    await expect(client.convert({ filePath: inputPath })).rejects.toMatchObject(
      {
        name: "Office2PDFError",
        code: "QUOTA_EXCEEDED",
        status: 413,
        requestId: "rid_413",
      }
    );

    await fsp.unlink(inputPath);
  });

  it("falls back to a default message when JSON error has no message", async () => {
    const client = new Office2PDF({
      apiKey: "op2p_test_123",
      baseUrl: "https://api.office2pdf.app",
      timeoutMs: 5_000,
      maxRetries: 0,
    });

    const inputPath = tmpFile("input.docx");
    await writeDummyInput(inputPath);

    const pool = agent.get("https://api.office2pdf.app");
    pool.intercept({ method: "POST", path: "/api/pdf/preview" }).reply(
      502,
      {
        // intentionally missing "message"
        error: "CONVERT_FAILED",
      },
      {
        headers: {
          "content-type": "application/json",
          "x-request-id": "rid_no_msg",
        },
      }
    );

    try {
      await client.convert({ filePath: inputPath });
      throw new Error("Expected convert() to throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Office2PDFError);
      expect(e.code).toBe("SERVER_ERROR");
      expect(e.status).toBe(502);
      expect(e.requestId).toBe("rid_no_msg");
      // fallback message
      expect(String(e.message)).toBe("Request failed with status 502");
      // keep details for debugging
      expect(e.details).toMatchObject({ error: "CONVERT_FAILED" });
    } finally {
      await fsp.unlink(inputPath);
    }
  });
});
