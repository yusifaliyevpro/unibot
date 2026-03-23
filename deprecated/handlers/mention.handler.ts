// Removed because now Whatsapp has this feature built in and it is no longer needed to be implemented by the bot

// import { UniBotID } from "@/lib/constants";
// import { sendErrorLog, sendLog } from "@/lib/logger";
// import { LogMessages } from "@/lib/logger_messages";
// import WAWebJS, { GroupChat } from "whatsapp-web.js";

// export async function mentionGroupParticipants(msg: WAWebJS.Message, chat: WAWebJS.Chat) {
//   try {
//     const groupMates = (chat as GroupChat).participants.filter((e) => e.id._serialized !== UniBotID);
//     const mentions = groupMates.map((participant) => participant.id._serialized);
//     const text = groupMates.map((participant) => `@${participant.id.user}`).join(" ");
//     if (msg.hasQuotedMsg) {
//       const quotedMessage = await msg.getQuotedMessage();
//       await quotedMessage.reply(text, "", { mentions });
//     } else await chat.sendMessage(text, { mentions });

//     await msg.react("✅");

//     await sendLog(LogMessages.MENTION_GROUP_PARTICIPANTS, msg);
//   } catch (error) {
//     await sendErrorLog(LogMessages.MENTION_GROUP_PARTICIPANTS, msg, error);
//   }
// }
