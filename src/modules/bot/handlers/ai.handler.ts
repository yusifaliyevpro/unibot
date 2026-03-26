import { GroupChat, Message } from "whatsapp-web.js";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { sendErrorLog, sendLog } from "@/lib/logger";
import { ENV } from "@/lib/env";
import { LogMessages, userFriendlyMessages } from "@/lib/logger_messages";

const openrouter = createOpenRouter({ apiKey: ENV.OPENROUTER_API_KEY });

export async function handleAIGroupMention(msg: Message, chat: GroupChat, isGroupMateOrChat: boolean, count: number) {
  try {
    await chat.sendStateTyping();
    await msg.react("⏳");

    let prompt = `${(await msg.getContact()).pushname}: ` + msg.body.replace(/@\d{9,15}/g, "").trim();
    const last5Messages = await chat.fetchMessages({ limit: 5 });
    const last5MessagesArray: { role: "user" | "assistant"; content: string }[] = [];
    let quotedMsgID = "";

    if (msg.hasQuotedMsg) {
      const quotedMsg = await msg.getQuotedMessage();
      quotedMsgID = quotedMsg.id._serialized;
      prompt += `\n\nQuoted message: ${quotedMsg.body.replace(/@\d{9,15}/g, "").trim()}`;
    }

    for (const lastmsg of last5Messages) {
      if (lastmsg.id._serialized === quotedMsgID) continue;
      if (lastmsg.body.replace(/@\d{9,15}/g, "").trim() === "") continue;
      const senderName = lastmsg.fromMe ? "" : `${(await lastmsg.getContact()).pushname}: `;
      last5MessagesArray.push({
        role: lastmsg.fromMe ? "assistant" : "user",
        content: senderName + lastmsg.body.replace(/@\d{9,15}/g, "").trim(),
      });
    }

    const { text } = await generateText({
      model: openrouter("deepseek/deepseek-chat-v3.1"),
      messages: [...last5MessagesArray, { role: "user", content: prompt }],
      system: AI_SYSTEM_PROMPT(chat.name, isGroupMateOrChat),
    });

    if (text === "" && count < 3) return await handleAIGroupMention(msg, chat, isGroupMateOrChat, count + 1);
    else if (count === 3) throw new Error("The Request count (3) limit reached");

    await chat.sendMessage(text);
    await msg.react("🤖");

    await sendLog(LogMessages.AI_MESSAGE, msg);
  } catch (error: unknown) {
    await sendErrorLog(LogMessages.AI_MESSAGE, msg, error);
    await msg.reply(userFriendlyMessages.AI_MESSAGE_FAIL);
  }
}

const AI_SYSTEM_PROMPT = (chatName: string, isGroupMateOrChat: boolean) =>
  `You are UniBot — a friendly, helpful WhatsApp bot created by Yusif Aliyev.
Yusif Aliyev’s links:\n${links}

Always reply in the language of the user's last message.
This chat is called "${chatName}". Messages will be like "Name Surname: message".
If user greets you, greet warmly and briefly introduce yourself. If user didn't greet, skip greetings and just respond question.
Don’t claim abilities you don’t have. Suggest users to use built-in commands instead.

Built-in commands:
${builtInCommands}
${isGroupMateOrChat ? groupMateCommands : ""} 

When needed, guide users to send these commands.

Use the following WhatsApp formatting (IT IS VERY IMPORTANT TO FOLLOW THAT GUIDES):

*Bold*: *text* 
_Italic_: _text_
~Strikethrough~: ~text~
Monospace: ${"```text```"}
Inline code: ${"`console.log()`"}
Bulleted list: - Item one
Numbered list: 1. Item one
Quote: > text
Links: 🔗 Text: https://example.com

Use emojis to make text more natural and keep replies lively. Stay brief, short, clear, and respectful.
`;

const links = `
🔗 Website: https://yusifaliyevpro.com/
🔗 GitHub: https://github.com/yusifaliyevpro
🔗 LinkedIn: https://www.linkedin.com/in/yusifaliyevpro/
`;

const builtInCommands = `
- /help @[az|en] — Helpbox
- /s — Image/Text to sticker
- /pdf - Anything to PDF
- /start — Starting an Intellectual Game
`;

const groupMateCommands = `
- /add @[shorten] — Adding task (admins only)
- /schedule — Today's schedule
- /schedule /tomorrow — Tomorrow's schedule
- /tasks — Today's tasks
- /tasks /tomorrow — Tomorrow's tasks
`;
