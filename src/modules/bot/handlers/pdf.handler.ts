import { Message, MessageMedia } from "whatsapp-web.js";
import { ServicePrincipalCredentials, PDFServices, MimeType, CreatePDFJob, CreatePDFResult } from "@adobe/pdfservices-node-sdk";
import { Readable } from "stream";
import { ENV } from "@/lib/env";
import { sendErrorLog, sendLog } from "@/lib/logger";
import { LogMessages } from "@/lib/logger_messages";

export async function handleConvertToPDF(msg: Message, commandMsg: Message) {
  let readStream: Readable | null = null;
  try {
    // Check media size from message metadata
    if (!msg.hasMedia) await commandMsg.reply("You must reply to a document");
    const mediaMetadata = msg as Message & { _data: { size: number } };
    const mediaSize = (mediaMetadata._data.size || 0) / (1024 * 1024);
    if (mediaSize > 21) return await commandMsg.reply("Maximum size is 20MB!");

    await commandMsg.react("⏳");

    // 1. Download the media from the message
    const media = await msg.downloadMedia();
    if (!media) return await msg.reply("There was a problem downloading the media.");

    // 2. Check if the file is already a PDF or unsupported
    if (media.mimetype === "application/pdf") return await msg.reply("The file is already in PDF format.");

    // Supported mimetypes by Adobe PDF Services
    const supportedMimeTypes = [
      MimeType.JPEG,
      MimeType.PNG,
      MimeType.JPG,
      MimeType.DOCX,
      MimeType.DOC,
      MimeType.XLSX,
      MimeType.XLS,
      MimeType.PPTX,
      MimeType.PPT,
      MimeType.TXT,
    ];

    const mimeType = media.mimetype as MimeType;
    if (!supportedMimeTypes.includes(mimeType)) return await msg.reply("I cannot convert this file format to PDF.");

    // 3. Convert buffer to readable stream
    const buffer = Buffer.from(media.data, "base64");
    const stream = bufferToStream(buffer);
    readStream = stream;

    // 4. Create Adobe Credentials and PDFServices instance
    const credentials = new ServicePrincipalCredentials({
      clientId: ENV.ADOBE_CLIENT_ID,
      clientSecret: ENV.ADOBE_CLIENT_SECRET,
    });
    const pdfServices = new PDFServices({ credentials });

    // 5. Upload the input file as a stream
    const inputAsset = await pdfServices.upload({
      readStream: stream,
      mimeType,
    });

    // 6. Create a PDF conversion job and submit
    const job = new CreatePDFJob({ inputAsset });
    const pollingURL = await pdfServices.submit({ job });

    // 7. Get the job result
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: CreatePDFResult,
    });

    if (!pdfServicesResponse.result) return await msg.reply("Failed to create PDF, no result received.");

    const resultAsset = pdfServicesResponse.result.asset;

    // 8. Get PDF content stream
    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    // 9. Convert stream to buffer
    const pdfBuffer = await streamToBuffer(streamAsset.readStream);

    // 10. Choose a fileName and capitalize it
    const originalFileName = media.filename ? media.filename.replaceAll(/\.(docx?|pptx?|png|xlsx?|doc|ppt|xls|)$/g, "").trim() : "";
    const capitalize = (str: string) => str.replace(/\b\w/g, (char) => char.toUpperCase());
    const fileName = `${capitalize(originalFileName.trim() || "Converted")} (TRUTH) by YusifAliyevPro(UniBot).pdf`;

    // 11. Send PDF buffer back to WhatsApp
    const pdf = new MessageMedia("application/pdf", pdfBuffer.toString("base64"), fileName);
    await msg.reply(pdf);
    await msg.react("📄");

    await sendLog(LogMessages.PDF_HANDLER, commandMsg);
  } catch (error) {
    await sendErrorLog(LogMessages.PDF_HANDLER, commandMsg, error);
  } finally {
    if (readStream) readStream.destroy();
  }
}

// Helper: Convert Buffer to Readable stream
function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

// Helper: Convert Readable stream to Buffer
function streamToBuffer(readStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readStream.on("data", (chunk) => {
      // Assert chunk type as Buffer
      chunks.push(chunk as Buffer);
    });
    readStream.on("end", () => resolve(Buffer.concat(chunks)));
    readStream.on("error", (err: unknown) => reject(err as Error));
  });
}
