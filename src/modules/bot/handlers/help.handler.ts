import { sendLog, sendErrorLog } from "../../../lib/logger.js";
import { LogMessages } from "../../../lib/logger_messages.js";
import { helpBox, universityHelpbox, helpBoxAZ } from "../../../lib/messages.js";
import type { Chat, Message } from "../../../lib/whatsapp.ts";

export async function handleHelpBox(chat: Chat, msg: Message, isGroupMateOrChat: boolean) {
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
