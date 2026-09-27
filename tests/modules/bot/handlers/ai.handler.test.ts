import { Logger } from "@nestjs/common";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { groups } from "../../../../src/lib/constants.ts";
import { userFriendlyMessages } from "../../../../src/lib/logger_messages.ts";
import { commands } from "../../../../src/lib/utils.ts";
import client from "../../../../src/modules/bot/client.ts";
import { handleAIGroupMention } from "../../../../src/modules/bot/handlers/ai.handler.ts";
import type { ScheduleService } from "../../../../src/modules/schedule/schedule.service.ts";
import { fakeChat, fakeMessage } from "../../../fakes.ts";

// The real generateText runs (spied) against a mock model, so tool calls are executed by the SDK itself
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateText: vi.fn(actual.generateText) as unknown as typeof actual.generateText };
});
const ai = vi.hoisted(() => ({ model: undefined as unknown, chat: undefined as unknown as (modelId: string) => unknown }));
vi.mock(
  import("@openrouter/ai-sdk-provider"),
  () => ({ createOpenRouter: vi.fn(() => ({ chat: (modelId: string) => ai.chat(modelId) })) }) as never,
);

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type Prompt = MockLanguageModelV4["doGenerateCalls"][number]["prompt"];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const reply = (text: string): GenerateResult => ({
  content: text ? [{ type: "text", text }] : [],
  finishReason: { unified: "stop", raw: "stop" },
  usage,
  warnings: [],
});
const toolCall = (toolName: string, input: object, text = ""): GenerateResult => ({
  content: [
    ...(text ? [{ type: "text" as const, text }] : []),
    { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
  ],
  finishReason: { unified: "tool-calls", raw: "tool_calls" },
  usage,
  warnings: [],
});

let model: MockLanguageModelV4;
const aiResponds = (...results: GenerateResult[]) => {
  model = new MockLanguageModelV4({ doGenerate: results });
  ai.model = model;
};

/** The conversation as the model received it: system text and plain role/content pairs */
function received(n = 0) {
  const prompt: Prompt = model.doGenerateCalls[n].prompt;
  const system = prompt.find((m) => m.role === "system")?.content as string;
  const messages = prompt
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: (m.content as { type: string; text?: string }[]).map((part) => part.text).join("") }));
  return { system, messages, tools: model.doGenerateCalls[n].tools?.map((t) => t.name) ?? [] };
}

let schedule: { sendSchedule: ReturnType<typeof vi.fn>; sendDaySchedule: ReturnType<typeof vi.fn> };
const scheduleService = () => schedule as unknown as ScheduleService;

beforeEach(() => {
  vi.mocked(generateText).mockClear();
  ai.chat = vi.fn(() => ai.model);
  schedule = { sendSchedule: vi.fn(async () => {}), sendDaySchedule: vi.fn(async () => {}) };
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

function setup({
  body = "@994500000001 what is a monad?",
  history = [] as ReturnType<typeof fakeMessage>[],
  quoted = undefined as ReturnType<typeof fakeMessage> | undefined,
} = {}) {
  const chat = fakeChat({ isGroup: true, name: "UniChat", id: groups.UNICHAT, history });
  const msg = fakeMessage({
    id: "CURRENT",
    body,
    pushname: "Ali Aliyev",
    chat,
    quoted,
    from: groups.UNICHAT,
    author: "100000000000001@lid",
  });
  return { chat, msg };
}

describe("handleAIGroupMention", () => {
  test("answers with the AI reply", async () => {
    aiResponds(reply("*Monad* is ... 🤓"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(ai.chat).toHaveBeenCalledWith("deepseek/deepseek-v4-flash");
    expect(msg.react.mock.calls).toEqual([["⏳"], ["🤖"]]);
    expect(chat.sendStateTyping).toHaveBeenCalled();
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("*Monad* is ... 🤓");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("*AI_MESSAGE* for *UniChat*"));
  });

  test("prompts with the sender's name and without mentions", async () => {
    aiResponds(reply("ok"));
    const { chat, msg } = setup({ body: "@994500000001  what is a monad?  @100000000000001" });

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(received().messages.at(-1)).toEqual({ role: "user", content: "Ali Aliyev: what is a monad?" });
  });

  test("drops the /unibot command from the prompt and history", async () => {
    aiResponds(reply("ok"));
    const history = [fakeMessage({ body: "/unibot hello", pushname: "Yusif" })];
    const chat = fakeChat({ name: "Yusif", id: "200000000000002@lid" });
    const msg = fakeMessage({
      id: "CURRENT",
      body: "/unibot send me next monday's schedule",
      pushname: "Yusif",
      chat,
      from: chat.id._serialized,
    });
    chat.fetchMessages.mockResolvedValue([...history, msg]);

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(received().messages).toEqual([
      { role: "user", content: "Yusif: hello" },
      { role: "user", content: "Yusif: send me next monday's schedule" },
    ]);
  });

  test("works in a private chat, sending tool results there", async () => {
    aiResponds(toolCall("sendWeekdaySchedule", { weekday: 1 }));
    const chat = fakeChat({ name: "Yusif", id: "200000000000002@lid" });
    const msg = fakeMessage({ body: "/unibot next monday", chat, from: chat.id._serialized });

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(schedule.sendDaySchedule).toHaveBeenCalledExactlyOnceWith(chat, 1, undefined);
    expect(received().system).toContain('This chat is called "Yusif"');
  });

  test("includes the recent conversation, without the current message", async () => {
    aiResponds(reply("ok"));
    const history = [
      fakeMessage({ body: "anyone did the homework?", pushname: "Vali" }),
      fakeMessage({ body: "Check the portal 📚", fromMe: true }),
      fakeMessage({ body: "@994500000001", pushname: "Aysel" }),
    ];
    const { chat, msg } = setup();
    chat.fetchMessages.mockResolvedValue([...history, msg]);

    await handleAIGroupMention(msg, chat, false, scheduleService());

    expect(chat.fetchMessages).toHaveBeenCalledWith({ limit: 5 });
    expect(received().messages).toEqual([
      { role: "user", content: "Vali: anyone did the homework?" },
      { role: "assistant", content: "Check the portal 📚" },
      { role: "user", content: "Ali Aliyev: what is a monad?" },
    ]);
  });

  test("adds the quoted message to the prompt instead of the history", async () => {
    aiResponds(reply("ok"));
    const quoted = fakeMessage({ id: "QUOTED", body: "@994500000001 Haskell is pure", pushname: "Vali" });
    const { chat, msg } = setup({ body: "@994500000001 explain this", quoted });
    chat.fetchMessages.mockResolvedValue([quoted, msg]);

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(received().messages).toEqual([{ role: "user", content: "Ali Aliyev: explain this\n\nQuoted message: Haskell is pure" }]);
  });

  test.for([
    [true, true],
    [false, false],
  ] as const)("group mate commands in the system prompt: %s", async ([isGroupMateOrChat, included]) => {
    aiResponds(reply("ok"));
    const { chat, msg } = setup();
    await handleAIGroupMention(msg, chat, isGroupMateOrChat, scheduleService());
    const { system } = received();
    expect(system).toContain('This chat is called "UniChat"');
    expect(system).toContain("/start — Starting an Intellectual Game");
    expect(system.includes("/schedule [1-5] /upper")).toBe(included);
  });

  test("suggests only existing commands", async () => {
    aiResponds(reply("ok"));
    const { chat, msg } = setup();
    await handleAIGroupMention(msg, chat, true, scheduleService());
    const suggested = received().system.match(/(?<=^|\s)\/\w+/gm);
    expect(suggested).not.toHaveLength(0);
    for (const command of suggested!) expect(Object.values(commands)).toContain(command);
  });

  test("retries empty replies and sends the first real one", async () => {
    aiResponds(reply(""), reply("second try"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("second try");
    expect(msg.reply).not.toHaveBeenCalled();
  });

  test("accepts a reply on the third and last attempt", async () => {
    aiResponds(reply(""), reply(""), reply("third time lucky"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(generateText).toHaveBeenCalledTimes(3);
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("third time lucky");
    expect(msg.reply).not.toHaveBeenCalled();
  });

  test("gives up after three empty replies with one apology", async () => {
    aiResponds(reply(""), reply(""), reply(""));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(generateText).toHaveBeenCalledTimes(3);
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalledExactlyOnceWith(userFriendlyMessages.AI_MESSAGE_FAIL);
  });

  test("apologises when the AI request fails", async () => {
    model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("429 rate limited");
      },
    });
    ai.model = model;
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(msg.reply).toHaveBeenCalledExactlyOnceWith(userFriendlyMessages.AI_MESSAGE_FAIL);
    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("🔴"));
  });

  test("apologises even when the error log cannot be sent", async () => {
    aiResponds(reply(""), reply(""), reply(""));
    vi.mocked(client.sendMessage).mockRejectedValue(new Error("log group gone"));
    const { chat, msg } = setup();

    await expect(handleAIGroupMention(msg, chat, true, scheduleService())).resolves.toBeUndefined();

    expect(msg.reply).toHaveBeenCalledExactlyOnceWith(userFriendlyMessages.AI_MESSAGE_FAIL);
  });
});

describe("schedule requests", () => {
  test("reports a failing schedule tool once, without retrying", async () => {
    aiResponds(toolCall("sendSchedule", { day: "today" }), reply("fallback"));
    schedule.sendSchedule.mockRejectedValueOnce(new Error("invalid_grant"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(generateText).toHaveBeenCalledOnce();
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(msg.react).not.toHaveBeenCalledWith("📅");
    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(msg.reply).toHaveBeenCalledExactlyOnceWith(userFriendlyMessages.AI_MESSAGE_FAIL);
  });

  test.for([
    ["send me next monday's schedule", "sendWeekdaySchedule", { weekday: 1 }, [1, undefined]],
    ["upper week wednesday?", "sendWeekdaySchedule", { weekday: 3, week: "upper" }, [3, "upper"]],
    ["cümə aşağı həftə", "sendWeekdaySchedule", { weekday: 5, week: "lower" }, [5, "lower"]],
  ] as const)("%j sends the weekday schedule", async ([body, toolName, input, [weekday, week]]) => {
    aiResponds(toolCall(toolName, input));
    const { chat, msg } = setup({ body: `@994500000001 ${body}` });

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(schedule.sendDaySchedule).toHaveBeenCalledExactlyOnceWith(chat, weekday, week);
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(msg.react.mock.calls).toEqual([["⏳"], ["📅"]]);
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("*AI_MESSAGE*"));
  });

  test.for([
    ["today", false],
    ["tomorrow", true],
  ] as const)("sends %s's schedule", async ([day, isForTomorrow]) => {
    aiResponds(toolCall("sendSchedule", { day }));
    const { chat, msg } = setup({ body: `@994500000001 ${day}?` });

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(schedule.sendSchedule).toHaveBeenCalledExactlyOnceWith(chat, isForTomorrow);
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test("sends no AI text alongside a tool call", async () => {
    aiResponds(toolCall("sendSchedule", { day: "tomorrow" }, "Sure! Here is tomorrow's schedule 📅"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(schedule.sendSchedule).toHaveBeenCalledOnce();
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(generateText).toHaveBeenCalledOnce();
  });

  test("falls back to a text reply when the tool input is invalid", async () => {
    aiResponds(toolCall("sendWeekdaySchedule", { weekday: 7 }), reply("There are no lessons on Sundays 🙂"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(schedule.sendDaySchedule).not.toHaveBeenCalled();
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("There are no lessons on Sundays 🙂");
  });

  test("offers the schedule tools and today's date in class groups", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T10:00:00+04:00"));
    aiResponds(reply("ok"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, scheduleService());

    expect(received().tools.toSorted()).toEqual(["sendSchedule", "sendWeekdaySchedule"]);
    expect(received().system).toContain("Today is Monday, September 28, 2026.");
  });

  test("offers no tools outside class groups", async () => {
    aiResponds(reply("ok"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, false, scheduleService());

    expect(received().tools).toEqual([]);
    expect(received().system).not.toContain("Today is");
  });
});
