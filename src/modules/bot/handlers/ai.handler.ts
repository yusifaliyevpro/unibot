import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, tool } from "ai";
import { z } from "zod";
import { ENV } from "../../../lib/env.js";
import { sendErrorLog, sendLog } from "../../../lib/logger.js";
import { LogMessages, userFriendlyMessages } from "../../../lib/logger_messages.js";
import { cleanPrompt } from "../../../lib/utils.js";
import type { Chat, Message } from "../../../lib/whatsapp.ts";
import type { ScheduleService } from "../../schedule/schedule.service.ts";

const openrouter = createOpenRouter({ apiKey: ENV.OPENROUTER_API_KEY });

export async function handleAIGroupMention(
  msg: Message,
  chat: Chat,
  isGroupMateOrChat: boolean,
  scheduleService: ScheduleService,
  count = 1,
) {
  try {
    await chat.sendStateTyping();
    await msg.react("⏳");

    let prompt = `${(await msg.getContact()).pushname}: ` + cleanPrompt(msg.body);
    const last5Messages = await chat.fetchMessages({ limit: 5 });
    const last5MessagesArray: { role: "user" | "assistant"; content: string }[] = [];
    let quotedMsgID = "";

    if (msg.hasQuotedMsg) {
      const quotedMsg = await msg.getQuotedMessage();
      quotedMsgID = quotedMsg.id._serialized;
      prompt += `\n\nQuoted message: ${cleanPrompt(quotedMsg.body)}`;
    }

    for (const lastmsg of last5Messages) {
      // The current and quoted messages are already part of the prompt
      if (lastmsg.id._serialized === msg.id._serialized || lastmsg.id._serialized === quotedMsgID) continue;
      if (cleanPrompt(lastmsg.body) === "") continue;
      const senderName = lastmsg.fromMe ? "" : `${(await lastmsg.getContact()).pushname}: `;
      last5MessagesArray.push({
        role: lastmsg.fromMe ? "assistant" : "user",
        content: senderName + cleanPrompt(lastmsg.body),
      });
    }

    const { text, toolResults } = await generateText({
      model: openrouter.chat("deepseek/deepseek-v4-flash"),
      messages: [...last5MessagesArray, { role: "user", content: prompt }],
      system: AI_SYSTEM_PROMPT(chat.name, isGroupMateOrChat),
      // Schedule commands are only for our class groups, like the commands themselves
      tools: isGroupMateOrChat ? scheduleTools(chat, scheduleService) : undefined,
    });

    // A tool already sent the result to the chat, any text alongside it is dropped
    if (toolResults.length) {
      await msg.react("📅");
      return await sendLog(LogMessages.AI_MESSAGE, msg);
    }

    if (text === "") {
      if (count < 3) return await handleAIGroupMention(msg, chat, isGroupMateOrChat, scheduleService, count + 1);
      throw new Error("The Request count (3) limit reached");
    }

    await chat.sendMessage(text);
    await msg.react("🤖");

    await sendLog(LogMessages.AI_MESSAGE, msg);
  } catch (error: unknown) {
    await sendErrorLog(LogMessages.AI_MESSAGE, msg, error);
    await msg.reply(userFriendlyMessages.AI_MESSAGE_FAIL);
  }
}

/** Same actions as the /schedule commands, they send the schedule to the chat themselves */
const scheduleTools = (chat: Chat, scheduleService: ScheduleService) => ({
  sendSchedule: tool({
    description: "Sends today's or tomorrow's class schedule to the chat.",
    inputSchema: z.object({ day: z.enum(["today", "tomorrow"]) }),
    execute: async ({ day }) => {
      await scheduleService.sendSchedule(chat, day === "tomorrow");
      return "sent";
    },
  }),
  sendWeekdaySchedule: tool({
    description:
      "Sends the class schedule of a weekday (its next occurrence) to the chat. Without a week, both upper and lower week schedules are sent.",
    inputSchema: z.object({
      weekday: z.number().int().min(1).max(5).describe("1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday"),
      week: z.enum(["upper", "lower"]).optional().describe("Only when the user explicitly asks for the upper or lower week"),
    }),
    execute: async ({ weekday, week }) => {
      await scheduleService.sendDaySchedule(chat, weekday, week);
      return "sent";
    },
  }),
});

const scheduleToolsPrompt = () => `
Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
When the user asks for a class schedule (today, tomorrow, a weekday, the upper or lower week), don't answer with text: call the matching tool, it sends the schedule to the chat by itself.
`;

const AI_SYSTEM_PROMPT = (chatName: string, isGroupMateOrChat: boolean) =>
  `You are UniBot — a friendly, helpful WhatsApp bot created by Yusif Aliyev.
Yusif Aliyev’s links:\n${links}

Always reply in the language of the user's last message.
This chat is called "${chatName}". Messages will be like "Name Surname: message".
If user greets you, greet warmly and briefly introduce yourself. If user didn't greet, skip greetings and just respond question.
Don’t claim abilities you don’t have. Suggest users to use built-in commands instead.

Built-in commands:
${builtInCommands}
${isGroupMateOrChat ? groupMateCommands + scheduleToolsPrompt() : ""} 

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
- /schedule [1-5] — Schedule of a weekday (1 = Monday), both upper and lower weeks
- /schedule [1-5] /upper — Weekday schedule of the upper week
- /schedule [1-5] /lower — Weekday schedule of the lower week
- /tasks — Today's tasks
- /tasks /tomorrow — Tomorrow's tasks
`;
