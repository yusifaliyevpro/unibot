import { Logger } from "@nestjs/common";
import { generateText } from "ai";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { groups } from "../../../../src/lib/constants.ts";
import { userFriendlyMessages } from "../../../../src/lib/logger_messages.ts";
import client from "../../../../src/modules/bot/client.ts";
import { handleAIGroupMention } from "../../../../src/modules/bot/handlers/ai.handler.ts";
import { fakeChat, fakeMessage } from "../../../fakes.ts";

vi.mock(import("ai"), async (importOriginal) => ({ ...(await importOriginal()), generateText: vi.fn() }));
vi.mock(
  import("@openrouter/ai-sdk-provider"),
  () => ({ createOpenRouter: vi.fn(() => ({ chat: (modelId: string) => ({ modelId }) })) }) as never,
);

type GenerateTextArgs = { model: { modelId: string }; system: string; messages: { role: string; content: string }[] };
const aiReplies = (...texts: string[]) => {
  for (const text of texts) vi.mocked(generateText).mockResolvedValueOnce({ text } as never);
};
const aiCall = (n = 0) => vi.mocked(generateText).mock.calls[n][0] as unknown as GenerateTextArgs;

beforeEach(() => {
  vi.mocked(generateText).mockReset();
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
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
    aiReplies("*Monad* is ... 🤓");
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, 1);

    expect(msg.react.mock.calls).toEqual([["⏳"], ["🤖"]]);
    expect(chat.sendStateTyping).toHaveBeenCalled();
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("*Monad* is ... 🤓");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("*AI_MESSAGE* for *UniChat*"));
  });

  test("prompts with the sender's name and without mentions", async () => {
    aiReplies("ok");
    const { chat, msg } = setup({ body: "@994500000001  what is a monad?  @100000000000001" });

    await handleAIGroupMention(msg, chat, true, 1);

    expect(aiCall().model).toEqual({ modelId: "deepseek/deepseek-v4-flash" });
    expect(aiCall().messages.at(-1)).toEqual({ role: "user", content: "Ali Aliyev: what is a monad?" });
  });

  test("includes the recent conversation, without the current message", async () => {
    aiReplies("ok");
    const history = [
      fakeMessage({ body: "anyone did the homework?", pushname: "Vali" }),
      fakeMessage({ body: "Check the portal 📚", fromMe: true }),
      fakeMessage({ body: "@994500000001", pushname: "Aysel" }),
    ];
    const { chat, msg } = setup();
    chat.fetchMessages.mockResolvedValue([...history, msg]);

    await handleAIGroupMention(msg, chat, false, 1);

    expect(chat.fetchMessages).toHaveBeenCalledWith({ limit: 5 });
    expect(aiCall().messages).toEqual([
      { role: "user", content: "Vali: anyone did the homework?" },
      { role: "assistant", content: "Check the portal 📚" },
      { role: "user", content: "Ali Aliyev: what is a monad?" },
    ]);
  });

  test("adds the quoted message to the prompt instead of the history", async () => {
    aiReplies("ok");
    const quoted = fakeMessage({ id: "QUOTED", body: "@994500000001 Haskell is pure", pushname: "Vali" });
    const { chat, msg } = setup({ body: "@994500000001 explain this", quoted });
    chat.fetchMessages.mockResolvedValue([quoted, msg]);

    await handleAIGroupMention(msg, chat, true, 1);

    expect(aiCall().messages).toEqual([{ role: "user", content: "Ali Aliyev: explain this\n\nQuoted message: Haskell is pure" }]);
  });

  test.for([
    [true, true],
    [false, false],
  ] as const)("group mate commands in the system prompt: %s", async ([isGroupMateOrChat, included]) => {
    aiReplies("ok");
    const { chat, msg } = setup();
    await handleAIGroupMention(msg, chat, isGroupMateOrChat, 1);
    const { system } = aiCall();
    expect(system).toContain('This chat is called "UniChat"');
    expect(system).toContain("/start — Starting an Intellectual Game");
    expect(system.includes("/schedule [1-5] /upper")).toBe(included);
  });

  test("retries empty replies and sends the first real one", async () => {
    aiReplies("", "second try");
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, 1);

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("second try");
    expect(msg.reply).not.toHaveBeenCalled();
  });

  test("accepts a reply on the third and last attempt", async () => {
    aiReplies("", "", "third time lucky");
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, 1);

    expect(generateText).toHaveBeenCalledTimes(3);
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith("third time lucky");
    expect(msg.reply).not.toHaveBeenCalled();
  });

  test("gives up after three empty replies with one apology", async () => {
    aiReplies("", "", "");
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, 1);

    expect(generateText).toHaveBeenCalledTimes(3);
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalledExactlyOnceWith(userFriendlyMessages.AI_MESSAGE_FAIL);
  });

  test("apologises when the AI request fails", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("429 rate limited"));
    const { chat, msg } = setup();

    await handleAIGroupMention(msg, chat, true, 1);

    expect(msg.reply).toHaveBeenCalledExactlyOnceWith(userFriendlyMessages.AI_MESSAGE_FAIL);
    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("🔴"));
  });
});
