// import * as QRCode from "qrcode";
// import { sendErrorLog, sendLog } from "@/lib/logger";
// import { LogMessages } from "@/lib/logger_messages";
// import WAWebJS, { MessageMedia } from "whatsapp-web.js";

// export async function handleQRCode(msg: WAWebJS.Message, body: string, chat: WAWebJS.Chat) {
//   const data = body.replace("/qr", "").trim();

//   try {
//     const qrCode = await QRCode.toBuffer(data, { width: 400 });
//     const image = new MessageMedia("image/png", qrCode.toString("base64"));
//     await chat.sendMessage(image);
//     await msg.react("✅");

//     await sendLog(LogMessages.QR_CODE_HANDLER, msg);
//   } catch (error) {
//     await sendErrorLog(LogMessages.QR_CODE_HANDLER, msg, error);
//   }
// }
