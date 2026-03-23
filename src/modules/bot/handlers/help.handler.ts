import WAWebJS, { Chat } from "whatsapp-web.js";
import { sendLog, sendErrorLog } from "@/lib/logger";
import { helpBox, universityHelpbox, helpBoxAZ } from "@/lib/messages";
import { LogMessages } from "@/lib/logger_messages";

export async function handleHelpBox(chat: Chat, msg: WAWebJS.Message, isGroupMateOrChat: boolean) {
  try {
    const isAZ = msg.body.toLowerCase().includes("@az");
    const messageBody = isAZ ? helpBoxAZ : helpBox + (isGroupMateOrChat ? universityHelpbox : "");
    await chat.sendMessage(messageBody, { linkPreview: false });
    await msg.react("🚀");
    await sendLog(LogMessages.HELPBOX_HANDLER, msg);
  } catch (error) {
    await sendErrorLog(LogMessages.HELPBOX_HANDLER, msg, error);
  }
}
