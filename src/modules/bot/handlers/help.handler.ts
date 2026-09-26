import { SuperAdminID } from "../../../lib/constants.js";
import { sendLog, sendErrorLog } from "../../../lib/logger.js";
import { LogMessages } from "../../../lib/logger_messages.js";
import { adminHelpbox, helpBox, universityHelpbox, helpBoxAZ } from "../../../lib/messages.js";
import type { Chat, Message } from "../../../lib/whatsapp.ts";

export async function handleHelpBox(chat: Chat, msg: Message, isGroupMateOrChat: boolean) {
  try {
    const isAZ = msg.body.toLowerCase().includes("@az");
    const isSuperAdmin = !chat.isGroup && msg.from === SuperAdminID;
    const messageBody = (isAZ ? helpBoxAZ : helpBox + (isGroupMateOrChat ? universityHelpbox : "")) + (isSuperAdmin ? adminHelpbox : "");
    await chat.sendMessage(messageBody, { linkPreview: false });
    await msg.react("🚀");
    await sendLog(LogMessages.HELPBOX_HANDLER, msg);
  } catch (error) {
    await sendErrorLog(LogMessages.HELPBOX_HANDLER, msg, error);
  }
}
