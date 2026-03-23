// import { sendErrorLog, sendLog } from "@/lib/logger";
// import { Chat, Message, MessageMedia } from "whatsapp-web.js";
// import * as path from "path";
// import { LogMessages } from "@/lib/logger_messages";

// export async function sendAzTUMap(msg: Message, chat: Chat) {
//   try {
//     const media = MessageMedia.fromFilePath(path.resolve(__dirname, "../../../../public/AzTU-Map.jpg"));
//     await chat.sendMessage(media);
//     await msg.react("🗺️");

//     await sendLog(LogMessages.MAP_HANDLER, msg);
//   } catch (error) {
//     await sendErrorLog(LogMessages.MAP_HANDLER, msg, error);
//   }
// }
