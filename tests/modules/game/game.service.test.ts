import { Logger } from "@nestjs/common";
import { generateText } from "ai";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { groups } from "../../../src/lib/constants.ts";
import { gameMsgs } from "../../../src/lib/logger_messages.ts";
import client from "../../../src/modules/bot/client.ts";
import { GameService } from "../../../src/modules/game/game.service.ts";
import type { PrismaService } from "../../../src/prisma.service.ts";
import { type FakeChat, fakeChat, fakeMessage, fakePrisma } from "../../fakes.ts";

vi.mock(import("../../../src/prisma.service.ts"), () => ({ PrismaService: class {} }) as never);
vi.mock(import("ai"), async (importOriginal) => ({ ...(await importOriginal()), generateText: vi.fn() }));
vi.mock(
  import("@openrouter/ai-sdk-provider"),
  () => ({ createOpenRouter: vi.fn(() => ({ chat: (modelId: string) => ({ modelId }) })) }) as never,
);
vi.mock(
  import("../../../src/3sual.ts"),
  () =>
    ({
      gamePackages: [
        {
          id: 7,
          name: "Payız kuboku",
          information: null,
          gameType: 1,
          editors: ["Aysel", "Vüsal"],
          questions: [
            {
              question: "  Paytaxt?  ",
              answer: "Bakı",
              considered: "Baku",
              authors: ["Aysel", "Vüsal"],
              comment: "Asan sual",
              rekvizit: null,
            },
            {
              question: "Rəng?",
              answer: "Qırmızı",
              considered: null,
              authors: ["Aysel"],
              comment: null,
              rekvizit: { text: true, rekvizit: " Bayraq " },
            },
            {
              question: "Şəkildə nə var?",
              answer: "Qız qalası",
              considered: null,
              authors: [],
              comment: null,
              rekvizit: { text: false, rekvizit: "tower.png" },
            },
          ],
        },
        {
          id: 9,
          name: null,
          information: null,
          gameType: 1,
          editors: [],
          questions: [{ question: "Tək sual", answer: "Bəli", considered: null, authors: ["Nigar"], comment: null, rekvizit: null }],
        },
      ],
    }) as never,
);

const PLAYER = "100000000000001@lid";

type Setup = { isGroup?: boolean; packageIndex?: number; lastQuestion?: number; correct?: number };

function setup({ isGroup = false, packageIndex = 0, lastQuestion = 0, correct = 0 }: Setup = {}) {
  const prisma = fakePrisma();
  const service = new GameService(prisma as unknown as PrismaService);
  const from = isGroup ? groups.UNICHAT : PLAYER;
  const chat = fakeChat({
    isGroup,
    id: from,
    participants: isGroup
      ? [
          { id: { _serialized: "300000000000003@lid" }, isAdmin: true, isSuperAdmin: false },
          { id: { _serialized: "400000000000004@lid" }, isAdmin: true, isSuperAdmin: true },
        ]
      : [],
  });
  prisma.sessions.push({
    id: "s1",
    phoneNumber: from,
    packageID: packageIndex === 0 ? 7 : 9,
    packageIndex,
    lastQuestion,
    isActive: true,
    numberOfCorrectAnswers: correct,
  });
  const answer = (body: string, extra: Parameters<typeof fakeMessage>[0] = {}) =>
    fakeMessage({ body, from, chat, author: isGroup ? PLAYER : undefined, ...extra });
  return { prisma, service, chat, answer, session: () => prisma.sessions[0] };
}

const texts = (chat: FakeChat) => chat.sendMessage.mock.calls.map(([content]) => content);
const aiSays = (correct: boolean) => vi.mocked(generateText).mockResolvedValueOnce({ output: { correct } } as never);

beforeEach(() => {
  vi.mocked(generateText).mockReset();
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(Buffer.from("png"), { headers: { "content-type": "image/png" } })),
  );
});

const Q1_ANSWER = "*Cavab: Bakı*\n\n*Müəlliflər:* Aysel, Vüsal\n\n*Meyar:* Baku\n\n*Şərh:* Asan sual";
const Q2_ANSWER = "*Cavab: Qırmızı*\n\n*Müəllif:* Aysel\n\n*Şərh:* *Yoxdur*";
const Q3_ANSWER = "*Cavab: Qız qalası*\n\n*Müəllif:* Yoxdur\n\n*Şərh:* *Yoxdur*";

describe("handleGameStart", () => {
  test("starts the requested package in a private chat", async () => {
    const { service, prisma, chat } = setup();
    prisma.sessions.length = 0;
    const msg = fakeMessage({ body: "/start 7", from: PLAYER, chat });

    await service.handleGameStart(msg, chat);

    expect(prisma.sessions).toEqual([
      { id: "session-1", phoneNumber: PLAYER, packageID: 7, packageIndex: 0, lastQuestion: 0, isActive: true, numberOfCorrectAnswers: 0 },
    ]);
    expect(msg.reply).toHaveBeenCalledWith(gameMsgs.START);
    expect(chat.sendMessage.mock.calls).toEqual([
      [
        'Siz *7* nömrəli, "Payız kuboku" adlı paketi oynayırsınız.\n\nBu Paket *3* sualdan ibarətdir.\n*Redaktorlar*: Aysel, Vüsal\nPaket linki: https://3sual.az/package/7',
        { linkPreview: false },
      ],
      ["1. Paytaxt?", { linkPreview: false }],
    ]);
    expect(msg.react).toHaveBeenCalledWith("🏓");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("*NEW_GAME*"));
  });

  test("describes a nameless package without editors", async () => {
    const { service, prisma, chat } = setup();
    prisma.sessions.length = 0;
    await service.handleGameStart(fakeMessage({ body: "/start 9", from: PLAYER, chat }), chat);
    expect(texts(chat)[0]).toBe(
      "Siz *9* nömrəli, adsız paketi oynayırsınız.\n\nBu Paket *1* sualdan ibarətdir.\nPaket linki: https://3sual.az/package/9",
    );
  });

  test("picks a random package without an id", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { service, prisma, chat } = setup();
    prisma.sessions.length = 0;
    await service.handleGameStart(fakeMessage({ body: "/start", from: PLAYER, chat }), chat);
    expect(prisma.sessions[0]).toMatchObject({ packageID: 9, packageIndex: 1 });
  });

  test("tells about an unknown package id", async () => {
    const { service, prisma, chat } = setup();
    prisma.sessions.length = 0;
    await service.handleGameStart(fakeMessage({ body: "/start 12345", from: PLAYER, chat }), chat);
    expect(texts(chat)).toEqual([expect.stringMatching(/^Paket tapılmadı!/)]);
    expect(prisma.sessions).toEqual([]);
  });

  test.for(["/start abc", "/start 7 now", "/start  7  8"])("explains the command format for %j", async (body) => {
    const { service, prisma, chat } = setup();
    prisma.sessions.length = 0;
    await service.handleGameStart(fakeMessage({ body, from: PLAYER, chat }), chat);
    expect(texts(chat)).toEqual([expect.stringMatching(/^Əmr səhvdir!/)]);
    expect(prisma.sessions).toEqual([]);
  });

  test("sends the answer sheet to the group owner", async () => {
    const { service, prisma, chat } = setup({ isGroup: true });
    prisma.sessions.length = 0;
    await service.handleGameStart(fakeMessage({ body: "/start 7", from: groups.UNICHAT, chat }), chat);
    expect(prisma.sessions[0].phoneNumber).toBe(groups.UNICHAT);
    expect(client.sendMessage).toHaveBeenCalledWith("400000000000004@lid", "1. Bakı\n2. Qırmızı\n3. Qız qalası");
  });

  test("skips the answer sheet when the group has no owner", async () => {
    const { service, prisma, chat } = setup({ isGroup: true });
    prisma.sessions.length = 0;
    chat.participants = chat.participants.map((p) => ({ ...p, isSuperAdmin: false }));
    await service.handleGameStart(fakeMessage({ body: "/start 7", from: groups.UNICHAT, chat }), chat);
    expect(vi.mocked(client.sendMessage).mock.calls.every(([to]) => to === groups.LOG)).toBe(true);
  });

  test("reports failures", async () => {
    const { service, prisma, chat } = setup();
    prisma.sessions.length = 0;
    prisma.gameSession.create.mockRejectedValueOnce(new Error("db down"));
    const msg = fakeMessage({ body: "/start 7", from: PLAYER, chat });
    await service.handleGameStart(msg, chat);
    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringMatching(/^🔴 .*\*NEW_GAME\*/));
  });
});

describe("hasActiveSession", () => {
  test("is true only for chats with an active game", async () => {
    const { service, prisma } = setup();
    await expect(service.hasActiveSession(PLAYER)).resolves.toBe(true);
    await expect(service.hasActiveSession("999999999999999@lid")).resolves.toBe(false);
    prisma.sessions[0].isActive = false;
    await expect(service.hasActiveSession(PLAYER)).resolves.toBe(false);
  });
});

describe("handleGame", () => {
  test("does nothing without an active session", async () => {
    const { service, prisma, chat, answer } = setup();
    prisma.sessions[0].isActive = false;
    const msg = answer("Bakı");
    await service.handleGame(msg, chat, false);
    expect(msg.react).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test.for([
    ["the exact answer", "bakı"],
    ["the answer within a sentence", "Məncə BAKI şəhəridir"],
    ["the alternative answer", "baku"],
  ])("accepts %s and moves on", async ([, body]) => {
    const { service, chat, answer, session } = setup();
    const msg = answer(body);

    await service.handleGame(msg, chat, false);

    expect(msg.react.mock.calls).toEqual([["⏳"], ["✅"]]);
    expect(msg.reply).toHaveBeenCalledWith(Q1_ANSWER, undefined, { linkPreview: false });
    expect(texts(chat)).toEqual(["2. Rəng?"].map((q) => `_*Rekvizit:*_ Bayraq\n\n${q}`));
    expect(session()).toMatchObject({ lastQuestion: 1, numberOfCorrectAnswers: 1, isActive: true });
    expect(generateText).not.toHaveBeenCalled();
  });

  test("asks the AI when the answer does not match literally", async () => {
    aiSays(true);
    const { service, chat, answer, session } = setup({ lastQuestion: 1 });
    const msg = answer("qirmizi");

    await service.handleGame(msg, chat, false);

    const { prompt } = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(prompt).toContain("Doğru cavab: Qırmızı");
    expect(prompt).toContain("İstifadəçinin cavabı: qirmizi");
    expect(prompt).not.toContain("null");
    expect(prompt).not.toContain("Sayılma");
    expect(msg.reply).toHaveBeenCalledWith(Q2_ANSWER, undefined, { linkPreview: false });
    expect(session()).toMatchObject({ lastQuestion: 2, numberOfCorrectAnswers: 1 });
  });

  test("gives the AI the alternative answer when there is one", async () => {
    aiSays(false);
    const { service, chat, answer } = setup();
    await service.handleGame(answer("Gəncə"), chat, false);
    const { prompt } = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(prompt).toContain("Sayılma Meyarı: Baku");
  });

  test("rejects a wrong answer and stays on the question", async () => {
    aiSays(false);
    const { service, chat, answer, session } = setup();
    const msg = answer("Gəncə");

    await service.handleGame(msg, chat, false);

    expect(msg.react.mock.calls).toEqual([["⏳"], ["❌"]]);
    expect(msg.reply).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(session()).toMatchObject({ lastQuestion: 0, numberOfCorrectAnswers: 0 });
  });

  test("treats an AI failure as a wrong answer", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("timeout"));
    const { service, chat, answer, session } = setup();
    const msg = answer("Gəncə");
    await service.handleGame(msg, chat, false);
    expect(msg.react).toHaveBeenLastCalledWith("❌");
    expect(session().lastQuestion).toBe(0);
  });

  test("/pass shows the answer and moves on without a point", async () => {
    const { service, chat, answer, session } = setup();
    const msg = answer("/pass");

    await service.handleGame(msg, chat, false);

    expect(msg.reply).toHaveBeenCalledWith(Q1_ANSWER, undefined, { linkPreview: false });
    expect(texts(chat)).toEqual(["_*Rekvizit:*_ Bayraq\n\n2. Rəng?"]);
    expect(session()).toMatchObject({ lastQuestion: 1, numberOfCorrectAnswers: 0 });
  });

  test("sends an image rekvizit before its question", async () => {
    const { service, chat, answer } = setup({ lastQuestion: 1 });
    await service.handleGame(answer("/pass"), chat, false);
    expect(fetch).toHaveBeenCalledWith("https://api.3sual.az/images/tower.png");
    expect(texts(chat)).toEqual([expect.objectContaining({ mimetype: "image/png", filename: "tower.png" }), "3. Şəkildə nə var?"]);
  });

  test("/quit ends the game with the stats", async () => {
    const { service, chat, answer, session } = setup({ lastQuestion: 1, correct: 1 });
    const msg = answer("/quit");

    await service.handleGame(msg, chat, false);

    expect(msg.reply.mock.calls).toEqual([[Q2_ANSWER, undefined, { linkPreview: false }], [gameMsgs.FINISHED]]);
    expect(texts(chat)).toEqual(["🧾 Paketdəki sualların sayı: 3\n📈 Oynanılan sual sayı: 2\n✅ Doğru cavabların sayı: 1"]);
    expect(session().isActive).toBe(false);
  });

  test("only group admins can quit a group game", async () => {
    const { service, chat, answer, session } = setup({ isGroup: true });
    const msg = answer("/quit");

    await service.handleGame(msg, chat, false);

    expect(msg.reply.mock.calls).toEqual([[gameMsgs.ONLY_ADMINS_CAN_QUIT]]);
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(session().isActive).toBe(true);
  });

  test("group admins can quit a group game", async () => {
    const { service, chat, answer, session } = setup({ isGroup: true });
    await service.handleGame(answer("/quit"), chat, true);
    expect(session().isActive).toBe(false);
  });

  test("a group admin can accept an answer by replying ✅", async () => {
    const { service, chat, answer, session } = setup({ isGroup: true });
    const playerAnswer = answer("Bakı şəhəri");
    const approval = answer("✅", { quoted: playerAnswer, author: "300000000000003@lid" });

    await service.handleGame(approval, chat, true);

    expect(playerAnswer.react).toHaveBeenCalledWith("✅");
    expect(playerAnswer.reply).toHaveBeenCalledWith(Q1_ANSWER, undefined, { linkPreview: false });
    expect(texts(chat)).toEqual(["_*Rekvizit:*_ Bayraq\n\n2. Rəng?"]);
    expect(session()).toMatchObject({ lastQuestion: 1, numberOfCorrectAnswers: 1 });
  });

  test("a ✅ from a non-admin is just an answer", async () => {
    aiSays(false);
    const { service, chat, answer, session } = setup({ isGroup: true });
    const playerAnswer = answer("Bakı");
    const approval = answer("✅", { quoted: playerAnswer });

    await service.handleGame(approval, chat, false);

    expect(playerAnswer.react).not.toHaveBeenCalled();
    expect(session().lastQuestion).toBe(0);
  });

  describe("on the last question", () => {
    test("a correct answer finishes the game with the final stats", async () => {
      const { service, chat, answer, session } = setup({ lastQuestion: 2, correct: 1 });
      const msg = answer("qız qalası");

      await service.handleGame(msg, chat, false);

      expect(msg.reply.mock.calls).toEqual([[Q3_ANSWER, undefined, { linkPreview: false }], [gameMsgs.FINISHED]]);
      expect(texts(chat)).toEqual(["🧾 Paketdəki sualların sayı: 3\n📈 Oynanılan sual sayı: 3\n✅ Doğru cavabların sayı: 2"]);
      expect(session()).toMatchObject({ isActive: false, numberOfCorrectAnswers: 2 });
    });

    test("a wrong answer keeps the game going", async () => {
      aiSays(false);
      const { service, chat, answer, session } = setup({ lastQuestion: 2 });
      const msg = answer("Şirvanşahlar sarayı");

      await service.handleGame(msg, chat, false);

      expect(msg.react).toHaveBeenLastCalledWith("❌");
      expect(msg.reply).not.toHaveBeenCalled();
      expect(chat.sendMessage).not.toHaveBeenCalled();
      expect(session().isActive).toBe(true);
    });

    test("/pass finishes the game", async () => {
      const { service, chat, answer, session } = setup({ lastQuestion: 2 });
      const msg = answer("/pass");

      await service.handleGame(msg, chat, false);

      expect(msg.reply.mock.calls).toEqual([[Q3_ANSWER, undefined, { linkPreview: false }], [gameMsgs.FINISHED]]);
      expect(texts(chat)).toEqual(["🧾 Paketdəki sualların sayı: 3\n📈 Oynanılan sual sayı: 3\n✅ Doğru cavabların sayı: 0"]);
      expect(session().isActive).toBe(false);
    });

    test("/quit finishes the game once", async () => {
      const { service, chat, answer } = setup({ lastQuestion: 2 });
      const msg = answer("/quit");

      await service.handleGame(msg, chat, false);

      expect(msg.reply.mock.calls).toEqual([[Q3_ANSWER, undefined, { linkPreview: false }], [gameMsgs.FINISHED]]);
      expect(chat.sendMessage).toHaveBeenCalledOnce();
    });
  });

  test("reports failures", async () => {
    const { service, prisma, chat, answer } = setup();
    prisma.gameSession.findFirst.mockRejectedValueOnce(new Error("db down"));
    const msg = answer("Bakı");
    await service.handleGame(msg, chat, false);
    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringMatching(/^🔴 .*\*GAME_HANDLER\*/));
  });
});
