import type { calendar_v3 } from "@googleapis/calendar";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { groups, SHIFT } from "../../../src/lib/constants.ts";
import type { Message } from "../../../src/lib/whatsapp.ts";
import { BotService } from "../../../src/modules/bot/bot.service.ts";
import client from "../../../src/modules/bot/client.ts";
import { handleAIGroupMention } from "../../../src/modules/bot/handlers/ai.handler.ts";
import { handleHelpBox } from "../../../src/modules/bot/handlers/help.handler.ts";
import { handleConvertToPDF } from "../../../src/modules/bot/handlers/pdf.handler.ts";
import { handleSticker } from "../../../src/modules/bot/handlers/sticker.handler.ts";
import type { GoogleCalendarService } from "../../../src/modules/calendar/calendar.service.ts";
import type { GameService } from "../../../src/modules/game/game.service.ts";
import type { ScheduleService } from "../../../src/modules/schedule/schedule.service.ts";
import { type FakeChat, fakeChat, fakeMessage } from "../../fakes.ts";

// Handlers have their own tests, here only the routing to them is checked
vi.mock(import("../../../src/modules/bot/handlers/ai.handler.ts"), () => ({ handleAIGroupMention: vi.fn() }));
vi.mock(import("../../../src/modules/bot/handlers/help.handler.ts"), () => ({ handleHelpBox: vi.fn() }));
vi.mock(import("../../../src/modules/bot/handlers/pdf.handler.ts"), () => ({ handleConvertToPDF: vi.fn() }));
vi.mock(import("../../../src/modules/bot/handlers/sticker.handler.ts"), () => ({ handleSticker: vi.fn() }));
vi.mock(import("../../../src/prisma.service.ts"), () => ({ PrismaService: class {} }) as never);

const BOT_LID = "900000000000001@lid";
const MATE = "100000000000001@lid";
const ADMIN = "300000000000003@lid";
const STRANGER = "700000000000007@lid";
// Not a UniChat member, but still a group mate
const SUPER_ADMIN = "200000000000002@lid";

const uniChat = fakeChat({
  isGroup: true,
  id: groups.UNICHAT,
  name: "UniChat",
  participants: [
    { id: { _serialized: MATE }, isAdmin: false, isSuperAdmin: false },
    { id: { _serialized: ADMIN }, isAdmin: true, isSuperAdmin: false },
  ],
});

let game: { hasActiveSession: ReturnType<typeof vi.fn>; handleGame: ReturnType<typeof vi.fn>; handleGameStart: ReturnType<typeof vi.fn> };
let schedule: {
  sendSchedule: ReturnType<typeof vi.fn>;
  sendDaySchedule: ReturnType<typeof vi.fn>;
  generateScheduleText: ReturnType<typeof vi.fn>;
};
let calendar: { getSchedule: ReturnType<typeof vi.fn>; getNextLesson: ReturnType<typeof vi.fn> };
let service: BotService;

async function emit(event: "ready" | "qr" | "disconnected" | "message", ...args: unknown[]) {
  await Promise.all(client.listeners(event).map((listener) => (listener as (...a: unknown[]) => unknown)(...args)));
}

async function start() {
  service = new BotService(
    game as unknown as GameService,
    schedule as unknown as ScheduleService,
    calendar as unknown as GoogleCalendarService,
  );
  await service.onModuleInit();
  await emit("ready");
}

beforeEach(() => {
  vi.mocked(handleAIGroupMention).mockReset();
  vi.mocked(handleHelpBox).mockReset();
  vi.mocked(handleConvertToPDF).mockReset();
  vi.mocked(handleSticker).mockReset();
  uniChat.sendMessage.mockClear();
  game = { hasActiveSession: vi.fn(async () => false), handleGame: vi.fn(), handleGameStart: vi.fn() };
  schedule = {
    sendSchedule: vi.fn(),
    sendDaySchedule: vi.fn(),
    generateScheduleText: vi.fn((_events: unknown, day: Date) => `schedule for ${day.toLocaleDateString("sv-SE")}`),
  };
  calendar = { getSchedule: vi.fn(async () => []), getNextLesson: vi.fn(async () => null) };

  vi.spyOn(client, "initialize").mockResolvedValue(undefined);
  vi.spyOn(client, "sendPresenceAvailable").mockResolvedValue(undefined);
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(client, "getLid").mockImplementation(
    async (jid) => ({ "994500000001@s.whatsapp.net": BOT_LID, "994500000002@s.whatsapp.net": SUPER_ADMIN })[jid] ?? jid,
  );
  vi.spyOn(client, "getChatById").mockImplementation(async (jid) =>
    jid === groups.UNICHAT ? uniChat : fakeChat({ id: jid, isGroup: jid.endsWith("@g.us") }),
  );
  for (const level of ["log", "warn", "error", "verbose"] as const) vi.spyOn(Logger.prototype, level).mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  client.removeAllListeners();
  vi.useRealTimers();
});

describe("client lifecycle", () => {
  test("initializes the client and goes online when ready", async () => {
    await start();
    expect(client.initialize).toHaveBeenCalledOnce();
    expect(client.sendPresenceAvailable).toHaveBeenCalledOnce();
  });

  test("re-initializes after a disconnect", async () => {
    await start();
    await emit("disconnected", "LOGOUT");
    expect(client.initialize).toHaveBeenCalledTimes(2);
  });

  test("prints the QR code in the terminal", async () => {
    await start();
    await emit("qr", "2@pairing-code");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("▄"));
  });

  test("handles each message once even after becoming ready again", async () => {
    await start();
    await emit("ready");
    await emit("message", fakeMessage({ body: "/help", from: STRANGER }));
    expect(handleHelpBox).toHaveBeenCalledOnce();
  });
});

type IncomingInit = Parameters<typeof fakeMessage>[0] & { chatInit?: Parameters<typeof fakeChat>[0] };

/** Delivers a message; group messages come from UniChat unless another chat is given */
async function receive({ chatInit, ...init }: IncomingInit = {}) {
  const inGroup = !!init.author;
  const chat: FakeChat = chatInit ? fakeChat(chatInit) : inGroup ? uniChat : fakeChat({ id: init.from ?? STRANGER });
  const msg = fakeMessage({ from: inGroup ? chat.id._serialized : STRANGER, ...init, chat });
  await emit("message", msg);
  return { msg, chat };
}

describe("message routing", () => {
  beforeEach(async () => {
    await start();
  });

  test("plain messages get no response", async () => {
    const { msg, chat } = await receive({ body: "see you tomorrow" });
    expect(msg.reply).not.toHaveBeenCalled();
    expect(msg.react).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test("errors are contained", async () => {
    const msg = fakeMessage({ body: "/help" });
    msg.getChat.mockRejectedValueOnce(new Error("socket closed"));
    await expect(emit("message", msg)).resolves.not.toThrow();
    expect(console.log).toHaveBeenCalledWith(expect.any(Error));
  });

  describe("group mates", () => {
    test.for([
      ["a UniChat member in private", { from: MATE }, true],
      ["UniChat", { author: STRANGER }, true],
      ["the information group", { author: STRANGER, chatInit: { isGroup: true, id: groups.INFORMATION } }, true],
      ["the final exam group", { author: STRANGER, chatInit: { isGroup: true, id: groups.FINAL_EXAM } }, true],
      ["a stranger in private", { from: STRANGER }, false],
      ["another group", { author: MATE, chatInit: { isGroup: true, id: groups.TEST } }, false],
    ] as const)("%s counts as group mate: %s", async ([, init, expected]) => {
      await receive({ body: "/help", ...init });
      expect(vi.mocked(handleHelpBox).mock.calls[0][2]).toBe(expected);
    });
  });

  describe("games", () => {
    test("messages during a game are answers", async () => {
      game.hasActiveSession.mockResolvedValue(true);
      const { msg, chat } = await receive({ body: "Bakı" });
      expect(game.hasActiveSession).toHaveBeenCalledWith(STRANGER);
      expect(game.handleGame).toHaveBeenCalledWith(msg, chat, false);
    });

    test("group admins are recognised during a group game", async () => {
      game.hasActiveSession.mockResolvedValue(true);
      const { msg } = await receive({ body: "✅", author: ADMIN });
      expect(game.handleGame).toHaveBeenCalledWith(msg, uniChat, true);
    });

    test.for(["/pass", "/quit", "✅ düzdür"])("%j is passed to the game", async (body) => {
      game.hasActiveSession.mockResolvedValue(true);
      await receive({ body });
      expect(game.handleGame).toHaveBeenCalledOnce();
    });

    test.for(["/help", "/schedule", "/start 5"])("%j is refused during a game", async (body) => {
      game.hasActiveSession.mockResolvedValue(true);
      const { msg } = await receive({ body });
      expect(msg.reply).toHaveBeenCalledWith("Hal-hazırda aktiv sessiyanız var, əmrdən istifadə edə bilmək üçün oyunu bağlayın!");
      expect(game.handleGame).not.toHaveBeenCalled();
      expect(handleHelpBox).not.toHaveBeenCalled();
    });

    test("an answer containing a link is still an answer", async () => {
      game.hasActiveSession.mockResolvedValue(true);
      await receive({ body: "https://sites.google.com/start" });
      expect(game.handleGame).toHaveBeenCalledOnce();
    });

    test("/start in private starts a game", async () => {
      const { msg, chat } = await receive({ body: "/start 12" });
      expect(game.handleGameStart).toHaveBeenCalledWith(msg, chat);
    });

    test("a group admin can start a game", async () => {
      const { msg } = await receive({ body: "/start", author: ADMIN });
      expect(game.handleGameStart).toHaveBeenCalledWith(msg, uniChat);
    });

    test("other group members are told only admins can start", async () => {
      const { msg } = await receive({ body: "/start", author: MATE });
      expect(msg.reply).toHaveBeenCalledWith("Sadəcə qrup Adminləri oyun başlada bilər!");
      expect(game.handleGameStart).not.toHaveBeenCalled();
    });
  });

  describe("AI mentions", () => {
    test("mentioning the bot in a group asks the AI", async () => {
      const { msg } = await receive({ body: "@900000000000001 what's up?", author: MATE, mentionedIds: [BOT_LID] });
      expect(handleAIGroupMention).toHaveBeenCalledWith(msg, uniChat, true, schedule);
    });

    test("replying to the bot in a group asks the AI", async () => {
      const botMessage = fakeMessage({ body: "earlier answer", author: BOT_LID, fromMe: true });
      const { msg } = await receive({ body: "and why?", author: MATE, quoted: botMessage });
      expect(handleAIGroupMention).toHaveBeenCalledWith(msg, uniChat, true, schedule);
    });

    test("a bare mention in reply asks about the replied message", async () => {
      const question = fakeMessage({ body: "Does anyone know the exam room?", author: STRANGER });
      await receive({ body: "@900000000000001", author: MATE, mentionedIds: [BOT_LID], quoted: question });
      expect(vi.mocked(handleAIGroupMention).mock.calls[0][0]).toBe(question);
    });

    test("a bare mention alone is ignored", async () => {
      await receive({ body: " @900000000000001 ", author: MATE, mentionedIds: [BOT_LID] });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
    });

    test("mentioning someone else does nothing", async () => {
      await receive({ body: "@100000000000001 hi", author: STRANGER, mentionedIds: [MATE] });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
    });

    test("private messages never go to the AI", async () => {
      await receive({ body: "hey bot", mentionedIds: [BOT_LID] });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
    });

    test("/unibot in a group needs a mention like any message", async () => {
      await receive({ body: "/unibot hi", author: SUPER_ADMIN });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
    });

    test("a mention is answered by the AI only, not by other commands", async () => {
      await receive({ body: "@900000000000001 /help", author: MATE, mentionedIds: [BOT_LID] });
      expect(handleAIGroupMention).toHaveBeenCalledOnce();
      expect(handleHelpBox).not.toHaveBeenCalled();
    });
  });

  describe("/unibot in private", () => {
    test("the super admin can talk to the AI as a group mate", async () => {
      const { msg, chat } = await receive({ body: "/unibot send me next monday's schedule", from: SUPER_ADMIN });
      expect(handleAIGroupMention).toHaveBeenCalledExactlyOnceWith(msg, chat, true, schedule);
    });

    test("a bare /unibot asks about the replied message", async () => {
      const question = fakeMessage({ body: "When is the exam?", from: SUPER_ADMIN });
      await receive({ body: "/unibot", from: SUPER_ADMIN, quoted: question });
      expect(vi.mocked(handleAIGroupMention).mock.calls[0][0]).toBe(question);
    });

    test("a bare /unibot alone is ignored", async () => {
      await receive({ body: " /unibot ", from: SUPER_ADMIN });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
    });

    test("other people cannot use it", async () => {
      const { msg } = await receive({ body: "/unibot hi", from: MATE });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
      expect(msg.reply).not.toHaveBeenCalled();
    });

    test("the super admin's other messages are handled normally", async () => {
      await receive({ body: "what's up", from: SUPER_ADMIN });
      expect(handleAIGroupMention).not.toHaveBeenCalled();
    });

    test("the super admin counts as a group mate", async () => {
      await receive({ body: "/help", from: SUPER_ADMIN });
      expect(vi.mocked(handleHelpBox).mock.calls[0][2]).toBe(true);
    });
  });

  describe("reactions and help", () => {
    test("greetings in private get a wave and the help box", async () => {
      const { msg, chat } = await receive({ body: "Salam!" });
      expect(msg.react).toHaveBeenCalledWith("👋");
      expect(handleHelpBox).toHaveBeenCalledWith(chat, msg, false);
    });

    test("greetings in groups only get a wave", async () => {
      const { msg } = await receive({ body: "salam hamıya", author: MATE });
      expect(msg.react).toHaveBeenCalledWith("👋");
      expect(handleHelpBox).not.toHaveBeenCalled();
    });

    test("lion words get a lion", async () => {
      const { msg } = await receive({ body: "go Leo!", author: MATE });
      expect(msg.react).toHaveBeenCalledWith("🦁");
    });

    test("/help shows the help box", async () => {
      const { msg } = await receive({ body: "/help @az", author: MATE });
      expect(handleHelpBox).toHaveBeenCalledWith(uniChat, msg, true);
    });

    test("/confirm replies with the chat id", async () => {
      const { msg } = await receive({ body: "/confirm", author: MATE });
      expect(msg.reply).toHaveBeenCalledWith(groups.UNICHAT, undefined, { linkPreview: false });
      expect(msg.react).toHaveBeenCalledWith("✅");
    });

    test.for([
      ["/echo Hello *everyone*", "Hello *everyone*"],
      ["/ECHO Loud", "Loud"],
    ])("%j echoes %j", async ([body, expected]) => {
      const { chat } = await receive({ body, author: ADMIN });
      expect(chat.sendMessage).toHaveBeenCalledWith(expected, { linkPreview: false });
    });
  });

  describe("schedule", () => {
    test.for([
      ["/schedule", false],
      ["/schedule /tomorrow", true],
      ["/schedule 7", false],
      ["/schedule 0", false],
    ] as const)("%j sends today's or tomorrow's schedule", async ([body, isForTomorrow]) => {
      const { chat } = await receive({ body, author: MATE });
      expect(schedule.sendSchedule).toHaveBeenCalledWith(chat, isForTomorrow);
      expect(schedule.sendDaySchedule).not.toHaveBeenCalled();
    });

    test.for([
      ["/schedule 1", 1, undefined],
      ["/schedule 5", 5, undefined],
      ["/schedule 3 /upper", 3, "upper"],
      ["/schedule   2   /lower", 2, "lower"],
      ["/SCHEDULE 4 /UPPER", 4, "upper"],
    ] as const)("%j sends a weekday schedule", async ([body, weekday, week]) => {
      const { chat } = await receive({ body, author: MATE });
      expect(schedule.sendDaySchedule).toHaveBeenCalledWith(chat, weekday, week);
      expect(schedule.sendSchedule).not.toHaveBeenCalled();
    });

    test("does not also make a sticker", async () => {
      await receive({ body: "/schedule", author: MATE, quoted: fakeMessage({ body: "x" }) });
      expect(handleSticker).not.toHaveBeenCalled();
    });
  });

  describe("stickers and PDFs", () => {
    test("/s as a reply makes a sticker", async () => {
      const { msg } = await receive({ body: "/s", author: MATE, quoted: fakeMessage({ body: "quote me" }) });
      expect(handleSticker).toHaveBeenCalledWith(msg, uniChat);
    });

    test("/s without a reply does nothing", async () => {
      await receive({ body: "/s", author: MATE });
      expect(handleSticker).not.toHaveBeenCalled();
    });

    test("/start as a reply does not make a sticker", async () => {
      await receive({ body: "/start", quoted: fakeMessage({ body: "x" }) });
      expect(handleSticker).not.toHaveBeenCalled();
    });

    test("/pdf as a reply converts the replied document", async () => {
      const document = fakeMessage({ type: "document", hasMedia: true });
      const { msg } = await receive({ body: "/pdf", quoted: document });
      expect(handleConvertToPDF).toHaveBeenCalledWith(document, msg);
    });

    test("/pdf without a reply explains how to use it", async () => {
      const { msg } = await receive({ body: "/pdf" });
      expect(msg.reply).toHaveBeenCalledWith("You must send it as reply to a document");
      expect(handleConvertToPDF).not.toHaveBeenCalled();
    });
  });
});

type Cron = "_1" | "_2" | "_3" | "_4" | "_5";
const cronOf = (name: Cron) =>
  (Reflect.getMetadata("SCHEDULE_CRON_OPTIONS", BotService.prototype[name as keyof BotService]) as { cronTime: string }).cronTime;
const lessonAt = (iso: string): calendar_v3.Schema$Event => ({ summary: "X", start: { dateTime: iso }, end: { dateTime: iso } });
const postedTo = () => vi.mocked(client.getChatById).mock.calls.map(([jid]) => jid);
const runCron = async (name: Cron) => await (service as unknown as Record<Cron, () => Promise<void>>)[name]();

describe("cron jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    service = new BotService(
      game as unknown as GameService,
      schedule as unknown as ScheduleService,
      calendar as unknown as GoogleCalendarService,
    );
  });

  test("are scheduled at the shift's times", () => {
    expect([cronOf("_1"), cronOf("_2"), cronOf("_3"), cronOf("_4"), cronOf("_5")]).toEqual([
      SHIFT.scheduleCrons.beforeLastSlot,
      SHIFT.scheduleCrons.afterLastSlot,
      ...SHIFT.doorReminders.map((r) => r.cron),
    ]);
  });

  describe("door reminders", () => {
    test.for([
      ["_3", 9, 0],
      ["_4", 10, 30],
      ["_5", 12, 0],
    ] as const)("%s announces the %i:%i lesson in UniChat", async ([cron, hour, minute]) => {
      calendar.getNextLesson.mockResolvedValueOnce("⌛ _*PTMS (m)*_ starts in *15 minutes* at *1-520*");
      await runCron(cron);
      expect(calendar.getNextLesson).toHaveBeenCalledWith(hour, minute);
      expect(client.sendMessage).toHaveBeenCalledWith(groups.UNICHAT, "⌛ _*PTMS (m)*_ starts in *15 minutes* at *1-520*");
    });

    test("stays quiet without a lesson", async () => {
      await runCron("_3");
      expect(client.sendMessage).not.toHaveBeenCalled();
    });

    test("contains calendar failures", async () => {
      calendar.getNextLesson.mockRejectedValueOnce(new Error("invalid_grant"));
      await expect(runCron("_4")).resolves.toBeUndefined();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe("daily schedule", () => {
    const todayWithLastSlot = [lessonAt("2026-09-28T09:00:00+04:00"), lessonAt("2026-09-28T12:00:00+04:00")];
    const todayWithoutLastSlot = [lessonAt("2026-09-28T09:00:00+04:00"), lessonAt("2026-09-28T10:30:00+04:00")];

    function mockDay(today: calendar_v3.Schema$Event[]) {
      calendar.getSchedule.mockImplementation(async (day: Date) =>
        day.getDate() === new Date().getDate() ? today : [lessonAt("2099-01-01T09:00:00+04:00")],
      );
    }

    const pinned: ReturnType<typeof vi.fn>[] = [];
    beforeEach(() => {
      pinned.length = 0;
      vi.mocked(client.getChatById).mockImplementation(async (jid) => {
        const chat = fakeChat({ id: jid, isGroup: true });
        chat.sendMessage.mockImplementation(async () => {
          const sent = fakeMessage({ fromMe: true });
          pinned.push(sent.pin);
          return sent as Message;
        });
        return chat;
      });
    });

    test("posts tomorrow's schedule after the 2nd lesson when there is no 3rd", async () => {
      vi.setSystemTime(new Date("2026-09-28T11:50:00+04:00"));
      mockDay(todayWithoutLastSlot);

      await runCron("_1");

      expect(postedTo()).toEqual([groups.UNICHAT, groups.INFORMATION]);
      expect(schedule.generateScheduleText).toHaveBeenCalledWith(expect.any(Array), expect.any(Date));
      expect(schedule.generateScheduleText.mock.calls[0][1].toLocaleDateString("sv-SE")).toBe("2026-09-29");
      expect(pinned.map((pin) => pin.mock.calls)).toEqual([[[86400]], [[86400]]]);
    });

    test("waits for the 3rd lesson when there is one", async () => {
      vi.setSystemTime(new Date("2026-09-28T11:50:00+04:00"));
      mockDay(todayWithLastSlot);
      await runCron("_1");
      expect(postedTo()).toEqual([]);
    });

    test("posts after the 3rd lesson", async () => {
      vi.setSystemTime(new Date("2026-09-28T13:20:00+04:00"));
      mockDay(todayWithLastSlot);
      await runCron("_2");
      expect(postedTo()).toEqual([groups.UNICHAT, groups.INFORMATION]);
    });

    test("does not post twice on days without a 3rd lesson", async () => {
      vi.setSystemTime(new Date("2026-09-28T13:20:00+04:00"));
      mockDay(todayWithoutLastSlot);
      await runCron("_2");
      expect(postedTo()).toEqual([]);
    });

    test.for([
      ["Friday's schedule on Thursdays", "2026-10-01", "2026-10-02"],
      ["Monday's schedule on Fridays", "2026-10-02", "2026-10-05"],
    ] as const)("posts %s", async ([, today, expected]) => {
      vi.setSystemTime(new Date(`${today}T13:20:00+04:00`));
      calendar.getSchedule.mockImplementation(async (day: Date) =>
        day.toLocaleDateString("sv-SE") === today ? [lessonAt(`${today}T12:00:00+04:00`)] : [],
      );

      await runCron("_2");

      expect(schedule.generateScheduleText.mock.calls[0][1].toLocaleDateString("sv-SE")).toBe(expected);
    });

    test("skips pinning when the message was not sent", async () => {
      vi.setSystemTime(new Date("2026-09-28T11:50:00+04:00"));
      mockDay(todayWithoutLastSlot);
      vi.mocked(client.getChatById).mockImplementation(async (jid) => {
        const chat = fakeChat({ id: jid, isGroup: true });
        chat.sendMessage.mockResolvedValue(undefined as never);
        return chat;
      });
      await expect(runCron("_1")).resolves.toBeUndefined();
      expect(console.error).not.toHaveBeenCalled();
    });

    test("contains calendar failures", async () => {
      vi.setSystemTime(new Date("2026-09-28T11:50:00+04:00"));
      calendar.getSchedule.mockRejectedValueOnce(new Error("network"));
      await expect(runCron("_1")).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
      expect(postedTo()).toEqual([]);
    });
  });
});
