import { Readable } from "node:stream";
import { MimeType } from "@adobe/pdfservices-node-sdk";
import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { groups } from "../../../../src/lib/constants.ts";
import { MessageMedia } from "../../../../src/lib/whatsapp.ts";
import client from "../../../../src/modules/bot/client.ts";
import { handleConvertToPDF } from "../../../../src/modules/bot/handlers/pdf.handler.ts";
import { fakeMessage } from "../../../fakes.ts";

const adobe = vi.hoisted(() => ({
  credentials: vi.fn(),
  upload: vi.fn(),
  submit: vi.fn(),
  getJobResult: vi.fn(),
  getContent: vi.fn(),
}));

vi.mock(import("@adobe/pdfservices-node-sdk"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ServicePrincipalCredentials: vi.fn(
      class {
        constructor(options: unknown) {
          adobe.credentials(options);
        }
      },
    ),
    PDFServices: vi.fn(
      class {
        upload = adobe.upload;
        submit = adobe.submit;
        getJobResult = adobe.getJobResult;
        getContent = adobe.getContent;
      },
    ),
  } as never;
});

const MB = 1024 * 1024;
const PDF_BYTES = Buffer.from("%PDF-1.7 converted");

let uploadedBytes: Buffer;
let uploadStream: Readable;

beforeEach(() => {
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

  adobe.upload.mockReset().mockImplementation(async ({ readStream }: { readStream: Readable }) => {
    uploadStream = readStream;
    uploadedBytes = readStream.read() as Buffer;
    return { assetID: "input" };
  });
  adobe.submit.mockReset().mockResolvedValue("https://pdf-services/poll/1");
  adobe.getJobResult.mockReset().mockResolvedValue({ result: { asset: { assetID: "output" } } });
  adobe.getContent
    .mockReset()
    .mockImplementation(async () => ({ readStream: Readable.from([PDF_BYTES.subarray(0, 5), PDF_BYTES.subarray(5)]) }));
});

function setup(media?: { mimetype: string; filename?: string | null; data?: string }, size = 1 * MB) {
  const commandMsg = fakeMessage({ body: "/pdf" });
  const document = fakeMessage({
    hasMedia: !!media,
    size,
    media: media && new MessageMedia(media.mimetype, media.data ?? Buffer.from("file-bytes").toString("base64"), media.filename),
  });
  return { commandMsg, document };
}

describe("handleConvertToPDF", () => {
  test("converts a document and replies with the PDF", async () => {
    const { commandMsg, document } = setup({ mimetype: MimeType.DOCX, filename: "lab report.docx" });

    await handleConvertToPDF(document, commandMsg);

    expect(commandMsg.react).toHaveBeenCalledWith("⏳");
    expect(adobe.credentials).toHaveBeenCalledWith({ clientId: "test-adobe-id", clientSecret: "test-adobe-secret" });
    expect(adobe.upload).toHaveBeenCalledWith(expect.objectContaining({ mimeType: MimeType.DOCX }));
    expect(uploadedBytes).toEqual(Buffer.from("file-bytes"));
    expect(adobe.getJobResult).toHaveBeenCalledWith(expect.objectContaining({ pollingURL: "https://pdf-services/poll/1" }));
    expect(document.reply).toHaveBeenCalledExactlyOnceWith(
      new MessageMedia("application/pdf", PDF_BYTES.toString("base64"), "Lab Report (UniBot).pdf"),
    );
    expect(document.react).toHaveBeenCalledWith("📄");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("*PDF_HANDLER*"));
    expect(uploadStream.destroyed).toBe(true);
  });

  test.for([
    ["lab report.docx", "Lab Report (UniBot).pdf"],
    ["slides.PPTX", "Slides (UniBot).pdf"],
    ["photo.jpg", "Photo (UniBot).pdf"],
    ["scan.jpeg", "Scan (UniBot).pdf"],
    ["notes.txt", "Notes (UniBot).pdf"],
    ["budget.xls", "Budget (UniBot).pdf"],
    ["v1.2 final.doc", "V1.2 Final (UniBot).pdf"],
    [null, "Converted (UniBot).pdf"],
    ["   .docx", "Converted (UniBot).pdf"],
  ] as const)("names %j as %j", async ([filename, expected]) => {
    const { commandMsg, document } = setup({ mimetype: MimeType.DOCX, filename });
    await handleConvertToPDF(document, commandMsg);
    expect(document.reply).toHaveBeenCalledWith(expect.objectContaining({ filename: expected }));
  });

  test.for([MimeType.JPEG, MimeType.PNG, MimeType.DOC, MimeType.XLSX, MimeType.XLS, MimeType.PPTX, MimeType.PPT, MimeType.TXT])(
    "accepts %s",
    async (mimetype) => {
      const { commandMsg, document } = setup({ mimetype, filename: "file" });
      await handleConvertToPDF(document, commandMsg);
      expect(adobe.upload).toHaveBeenCalledWith(expect.objectContaining({ mimeType: mimetype }));
    },
  );

  test("asks for a document when the reply has no media", async () => {
    const { commandMsg, document } = setup(undefined);

    await handleConvertToPDF(document, commandMsg);

    expect(commandMsg.reply).toHaveBeenCalledExactlyOnceWith("You must reply to a document");
    expect(document.downloadMedia).not.toHaveBeenCalled();
    expect(commandMsg.react).not.toHaveBeenCalledWith("❌");
  });

  test.for([
    [20 * MB, false],
    [20.5 * MB, true],
    [50 * MB, true],
  ] as const)("a %i byte file is rejected: %s", async ([size, rejected]) => {
    const { commandMsg, document } = setup({ mimetype: MimeType.DOCX, filename: "big.docx" }, size);

    await handleConvertToPDF(document, commandMsg);

    expect(commandMsg.reply.mock.calls.some(([text]) => text === "Maximum size is 20MB!")).toBe(rejected);
    expect(adobe.upload).toHaveBeenCalledTimes(rejected ? 0 : 1);
  });

  test("refuses files that are already PDFs", async () => {
    const { commandMsg, document } = setup({ mimetype: "application/pdf", filename: "a.pdf" });
    await handleConvertToPDF(document, commandMsg);
    expect(document.reply).toHaveBeenCalledExactlyOnceWith("The file is already in PDF format.");
    expect(adobe.upload).not.toHaveBeenCalled();
  });

  test.for(["video/mp4", "application/zip", "audio/ogg"])("refuses unsupported %s files", async (mimetype) => {
    const { commandMsg, document } = setup({ mimetype, filename: "x" });
    await handleConvertToPDF(document, commandMsg);
    expect(document.reply).toHaveBeenCalledExactlyOnceWith("I cannot convert this file format to PDF.");
    expect(adobe.upload).not.toHaveBeenCalled();
  });

  test("reports when Adobe returns no result", async () => {
    adobe.getJobResult.mockResolvedValueOnce({ result: null });
    const { commandMsg, document } = setup({ mimetype: MimeType.DOCX, filename: "a.docx" });

    await handleConvertToPDF(document, commandMsg);

    expect(document.reply).toHaveBeenCalledExactlyOnceWith("Failed to create PDF, no result received.");
    expect(uploadStream.destroyed).toBe(true);
  });

  test("reports conversion failures on the command", async () => {
    adobe.submit.mockRejectedValueOnce(new Error("quota exceeded"));
    const { commandMsg, document } = setup({ mimetype: MimeType.DOCX, filename: "a.docx" });

    await handleConvertToPDF(document, commandMsg);

    expect(commandMsg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringMatching(/^🔴 .*\*PDF_HANDLER\*/));
    expect(document.reply).not.toHaveBeenCalled();
    expect(uploadStream.destroyed).toBe(true);
  });

  test("reports download failures", async () => {
    const { commandMsg, document } = setup({ mimetype: MimeType.DOCX, filename: "a.docx" });
    document.downloadMedia.mockRejectedValueOnce(new Error("media expired"));

    await handleConvertToPDF(document, commandMsg);

    expect(commandMsg.react).toHaveBeenCalledWith("❌");
    expect(adobe.upload).not.toHaveBeenCalled();
  });
});
