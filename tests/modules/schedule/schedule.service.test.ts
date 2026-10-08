import type { calendar_v3 } from "@googleapis/calendar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GoogleCalendarService } from "../../../src/modules/calendar/calendar.service.ts";
import { ScheduleService } from "../../../src/modules/schedule/schedule.service.ts";
import { fakeChat } from "../../fakes.ts";

// Even (Monday to Sunday) weeks are upper this semester: Sep 28 - Oct 4 2026 is week 40 (UPPER), Oct 5 - 11 is week 41 (LOWER)

const lesson = (day: string, start: string, end: string, summary: string): calendar_v3.Schema$Event => ({
  summary,
  start: { dateTime: `${day}T${start}:00+04:00` },
  end: { dateTime: `${day}T${end}:00+04:00` },
});

const ymd = (date: Temporal.PlainDate) => date.toString();

function createService(eventsByDay: Record<string, calendar_v3.Schema$Event[]> = {}) {
  const calendar = { getSchedule: vi.fn(async (day: Temporal.PlainDate) => eventsByDay[ymd(day)] ?? []) };
  const service = new ScheduleService(calendar as unknown as GoogleCalendarService);
  return { service, calendar, requestedDays: () => calendar.getSchedule.mock.calls.map(([day]) => ymd(day)) };
}

const sentTexts = (chat: ReturnType<typeof fakeChat>) => chat.sendMessage.mock.calls.map(([text]) => text as string);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Temporal"] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (iso: string) => vi.setSystemTime(iso);

describe("sendSchedule", () => {
  test("sends today's lessons with the week type", async () => {
    at("2026-09-28T08:00:00+04:00");
    const { service, requestedDays } = createService({
      "2026-09-28": [
        lesson("2026-09-28", "09:00", "10:20", "PTMS (m) | Ülviyyə | 1-520"),
        lesson("2026-09-28", "10:30", "11:50", "SL (M) | Ülviyyə | 3-408"),
      ],
    });
    const chat = fakeChat();

    await service.sendSchedule(chat, false);

    expect(requestedDays()).toEqual(["2026-09-28"]);
    expect(sentTexts(chat)).toEqual([
      "*Today* (*UPPER*)\n\n📅 09:00-10:20 | PTMS (m) | Ülviyyə | 1-520\n📅 10:30-11:50 | SL (M) | Ülviyyə | 3-408",
    ]);
  });

  test("sends tomorrow's lessons", async () => {
    at("2026-10-04T20:00:00+04:00");
    const { service, requestedDays } = createService({ "2026-10-05": [lesson("2026-10-05", "12:00", "13:20", "SL (m) | Çingiz | 1-102")] });
    const chat = fakeChat();

    await service.sendSchedule(chat, true);

    expect(requestedDays()).toEqual(["2026-10-05"]);
    expect(sentTexts(chat)).toEqual(["*Tomorrow* (*LOWER*)\n\n📅 12:00-13:20 | SL (m) | Çingiz | 1-102"]);
  });

  test.for([
    [false, "*Today* (*UPPER*)", "2026-10-01"],
    [true, "*Tomorrow* (*UPPER*)", "2026-10-02"],
  ] as const)("on Thursdays, tomorrow=%s is titled %s", async ([isForTomorrow, title, day]) => {
    at("2026-10-01T08:00:00+04:00");
    const { service } = createService({ [day]: [lesson(day, "09:00", "10:20", "NT (M) | A.rahman | 3-308")] });
    const chat = fakeChat();

    await service.sendSchedule(chat, isForTomorrow);

    expect(sentTexts(chat)[0].startsWith(`${title}\n`)).toBe(true);
  });

  test.for([
    [false, "You are free today😊"],
    [true, "You are free tomorrow😊"],
  ] as const)("free day, tomorrow=%s", async ([isForTomorrow, text]) => {
    at("2026-09-26T10:00:00+04:00");
    const { service } = createService();
    const chat = fakeChat();
    await service.sendSchedule(chat, isForTomorrow);
    expect(sentTexts(chat)).toEqual([text]);
  });

  test("returns the sent message", async () => {
    at("2026-09-28T08:00:00+04:00");
    const { service } = createService();
    const chat = fakeChat();
    const sent = await service.sendSchedule(chat, false);
    expect(sent).toBe(await chat.sendMessage.mock.results[0].value);
  });

  test("does not log to the console", async () => {
    at("2026-09-28T08:00:00+04:00");
    const { service } = createService();
    await service.sendSchedule(fakeChat(), false);
    expect(console.log).not.toHaveBeenCalled();
  });

  test("propagates calendar errors", async () => {
    at("2026-09-28T08:00:00+04:00");
    const { service, calendar } = createService();
    calendar.getSchedule.mockRejectedValueOnce(new Error("invalid_grant"));
    const chat = fakeChat();

    await expect(service.sendSchedule(chat, false)).rejects.toThrow("invalid_grant");
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});

describe("generateScheduleText", () => {
  test.for([
    ["today", "2026-09-28", "*Today* (*UPPER*)"],
    ["tomorrow", "2026-09-29", "*Tomorrow* (*UPPER*)"],
    ["another day by its name", "2026-10-05", "*Monday* (*LOWER*)"],
  ] as const)("titles %s", ([, day, title]) => {
    at("2026-09-28T13:20:00+04:00");
    const { service } = createService();
    const text = service.generateScheduleText([lesson(day, "09:00", "10:20", "DS (L)")], Temporal.PlainDate.from(day));
    expect(text).toBe(`${title}\n\n📅 09:00-10:20 | DS (L)`);
  });

  test.for([
    ["2026-09-28", "You are free today😊"],
    ["2026-09-29", "You are free tomorrow😊"],
    ["2026-10-05", "You are free on Monday😊"],
  ] as const)("free on %s", ([day, text]) => {
    at("2026-09-28T13:20:00+04:00");
    const { service } = createService();
    expect(service.generateScheduleText([], Temporal.PlainDate.from(day))).toBe(text);
  });

  test("a Sunday belongs to the week that started on Monday", () => {
    at("2026-10-02T12:00:00+04:00");
    const { service } = createService();
    const text = service.generateScheduleText([lesson("2026-10-04", "09:00", "10:20", "DS (L)")], Temporal.PlainDate.from("2026-10-04"));
    expect(text.split("\n")[0]).toBe("*Sunday* (*UPPER*)");
  });

  test("shows all-day events without times", () => {
    at("2026-09-28T13:20:00+04:00");
    const { service } = createService();
    const holiday = { summary: "Holiday", start: { date: "2026-09-29" }, end: { date: "2026-09-30" } };
    expect(service.generateScheduleText([holiday], Temporal.PlainDate.from("2026-09-29"))).toBe(
      "*Tomorrow* (*UPPER*)\n\n📅 All day | Holiday",
    );
  });

  test("formats midnight-adjacent times with a 24 hour clock", () => {
    at("2026-09-28T08:00:00+04:00");
    const { service } = createService();
    const text = service.generateScheduleText([lesson("2026-09-28", "00:05", "13:45", "Late")], Temporal.PlainDate.from("2026-09-28"));
    expect(text).toContain("📅 00:05-13:45 | Late");
  });
});

/** Lessons in the day's slots, in order */
const lessons = (day: string, ...summaries: string[]) =>
  summaries.map((summary, i) => lesson(day, ["09:00", "10:30", "12:00"][i], ["10:20", "11:50", "13:20"][i], summary));

describe("sendDaySchedule", () => {
  test("sends one schedule when both weeks are the same", async () => {
    at("2026-09-26T12:00:00+04:00");
    const { service, requestedDays } = createService({
      "2026-09-28": lessons("2026-09-28", "SL (M)", "SL (m)"),
      "2026-10-05": lessons("2026-10-05", "SL (M)", "SL (m)"),
    });
    const chat = fakeChat();

    await service.sendDaySchedule(chat, 1);

    expect(requestedDays().toSorted()).toEqual(["2026-09-28", "2026-10-05"]);
    expect(sentTexts(chat)).toEqual(["*Monday*\n\n📅 09:00-10:20 | SL (M)\n📅 10:30-11:50 | SL (m)"]);
  });

  test("sends upper and lower separately when they differ", async () => {
    at("2026-09-26T12:00:00+04:00");
    const { service } = createService({
      "2026-09-28": lessons("2026-09-28", "PTMS (m)", "SL (M)", "SL (m)"),
      "2026-10-05": [lesson("2026-10-05", "10:30", "11:50", "SL (M)")],
    });
    const chat = fakeChat();

    await service.sendDaySchedule(chat, 1);

    expect(sentTexts(chat)).toEqual([
      "*Monday* (*UPPER*)\n\n📅 09:00-10:20 | PTMS (m)\n📅 10:30-11:50 | SL (M)\n📅 12:00-13:20 | SL (m)",
      "*Monday* (*LOWER*)\n\n📅 10:30-11:50 | SL (M)",
    ]);
  });

  test("treats the same subjects at other times as different", async () => {
    at("2026-09-26T12:00:00+04:00");
    const { service } = createService({
      "2026-09-28": [lesson("2026-09-28", "09:00", "10:20", "DS (L)")],
      "2026-10-05": [lesson("2026-10-05", "10:30", "11:50", "DS (L)")],
    });
    const chat = fakeChat();
    await service.sendDaySchedule(chat, 1);
    expect(chat.sendMessage).toHaveBeenCalledTimes(2);
  });

  test.for([
    ["upper", "2026-09-28", "*Monday* (*UPPER*)"],
    ["lower", "2026-10-05", "*Monday* (*LOWER*)"],
  ] as const)("sends only the %s week when asked", async ([week, day, title]) => {
    at("2026-09-26T12:00:00+04:00");
    const { service, requestedDays } = createService({ [day]: lessons(day, "SL (M)") });
    const chat = fakeChat();

    await service.sendDaySchedule(chat, 1, week);

    expect(requestedDays()).toEqual([day]);
    expect(sentTexts(chat)).toEqual([`${title}\n\n📅 09:00-10:20 | SL (M)`]);
  });

  test.for([
    ["today when it is that weekday", "2026-09-28T15:00:00+04:00", 1, "2026-09-28", "2026-10-05"],
    ["next week's day when this week's is past", "2026-09-30T08:00:00+04:00", 2, "2026-10-13", "2026-10-06"],
    ["the coming Friday from a Sunday", "2026-09-27T08:00:00+04:00", 5, "2026-10-02", "2026-10-09"],
    ["this week's day from a lower week", "2026-10-05T08:00:00+04:00", 3, "2026-10-14", "2026-10-07"],
  ] as const)("picks %s", async ([, now, weekday, upperDay, lowerDay]) => {
    at(now);
    const { service, requestedDays } = createService();
    await service.sendDaySchedule(fakeChat(), weekday, "upper");
    await service.sendDaySchedule(fakeChat(), weekday, "lower");
    expect(requestedDays()).toEqual([upperDay, lowerDay]);
  });

  test.for([
    [1, "Monday"],
    [2, "Tuesday"],
    [3, "Wednesday"],
    [4, "Thursday"],
    [5, "Friday"],
  ] as const)("weekday %i is %s", async ([weekday, name]) => {
    at("2026-09-26T12:00:00+04:00");
    const { service } = createService();
    const chat = fakeChat();
    await service.sendDaySchedule(chat, weekday);
    expect(sentTexts(chat)).toEqual([`*${name}*\n\nYou are free😊`]);
  });

  test("propagates calendar errors", async () => {
    at("2026-09-26T12:00:00+04:00");
    const { service, calendar } = createService();
    calendar.getSchedule.mockRejectedValue(new Error("network"));
    const chat = fakeChat();
    await expect(service.sendDaySchedule(chat, 1)).rejects.toThrow("network");
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});
