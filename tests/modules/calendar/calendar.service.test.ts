import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GoogleCalendarService } from "../../../src/modules/calendar/calendar.service.ts";

vi.mock(import("@googleapis/calendar"), () => {
  const list = vi.fn();
  return {
    auth: {
      OAuth2: vi.fn(
        class {
          setCredentials = vi.fn();
        },
      ),
    },
    calendar: vi.fn(() => ({ events: { list } })),
  } as never;
});

const CALENDAR_ID = "6718afcc2fb6b3439a0846b80cb446c032144b1cb90101aee6472ce5f0997ff5@group.calendar.google.com";
const list = () => vi.mocked(calendar({ version: "v3" }).events.list as unknown as (...args: unknown[]) => Promise<unknown>);
const respond = (items?: calendar_v3.Schema$Event[]) => list().mockResolvedValueOnce({ data: { items } });

const lesson = (summary?: string): calendar_v3.Schema$Event => ({ summary, start: { dateTime: "2026-09-28T09:00:00+04:00" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T08:45:00+04:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("constructor", () => {
  test("authenticates with the Google token from the environment", () => {
    expect(new GoogleCalendarService()).toBeInstanceOf(GoogleCalendarService);
    const oauth = vi.mocked(auth.OAuth2).mock.results.at(-1)!.value as { setCredentials: ReturnType<typeof vi.fn> };
    expect(auth.OAuth2).toHaveBeenLastCalledWith("test-google-client-id", "test-google-client-secret", "http://localhost");
    expect(oauth.setCredentials).toHaveBeenCalledWith({
      type: "authorized_user",
      client_id: "id",
      client_secret: "secret",
      refresh_token: "token",
    });
  });

  test("throws without a Google token", () => {
    vi.stubEnv("GOOGLE_TOKEN", undefined);
    expect(() => new GoogleCalendarService()).toThrow("Google token is not defined");
  });
});

describe("getSchedule", () => {
  test("queries the lessons window of the shift on the given day", async () => {
    const events = [{ summary: "DS (L) | Şəbnəm | 6-606" }];
    respond(events);
    const day = new Date("2026-10-06T19:30:00+04:00");

    await expect(new GoogleCalendarService().getSchedule(day)).resolves.toEqual(events);
    expect(list()).toHaveBeenCalledWith({
      calendarId: CALENDAR_ID,
      timeMin: new Date("2026-10-06T09:00:00+04:00").toISOString(),
      timeMax: new Date("2026-10-06T13:20:00+04:00").toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });
    expect(day).toEqual(new Date("2026-10-06T19:30:00+04:00"));
  });

  test("returns an empty list when there are no events", async () => {
    respond(undefined);
    await expect(new GoogleCalendarService().getSchedule(new Date())).resolves.toEqual([]);
  });
});

describe("getNextLesson", () => {
  test("queries the 80 minutes lesson starting at the given time today", async () => {
    respond([]);
    await new GoogleCalendarService().getNextLesson(10, 30);
    expect(list()).toHaveBeenCalledWith(
      expect.objectContaining({
        timeMin: new Date("2026-09-28T10:30:00+04:00").toISOString(),
        timeMax: new Date("2026-09-28T11:50:00+04:00").toISOString(),
      }),
    );
  });

  test.for([
    ["a known subject", "DM (L) | Kamran | 3-401", "⌛ _*Discrete Mathematics (L) | Kamran*_ starts in *15 minutes* at *3-401*"],
    ["an unknown subject by its short name", "PTMS (m) | Ülviyyə | 1-520", "⌛ _*PTMS (m) | Ülviyyə*_ starts in *15 minutes* at *1-520*"],
    ["an online lesson", "NT (M) | A.rahman | Online", "⌛ _*NT (M) | A.rahman*_ starts in *15 minutes* *(Online)*"],
    ["a lesson without a teacher", "SL (L) | 4-502", "⌛ _*SL (L)*_ starts in *15 minutes* at *4-502*"],
    ["a lesson without a room", "TE (m) | Leyla | TBA", "⌛ _*TE (m) | Leyla*_ starts in *15 minutes* at *unknown*"],
    ["a lesson without a type", "GT | Nigar | 1-101", "⌛ _*Graph Theory | Nigar*_ starts in *15 minutes* at *1-101*"],
  ] as const)("announces %s", async ([, summary, expected]) => {
    respond([lesson(summary)]);
    await expect(new GoogleCalendarService().getNextLesson(9, 0)).resolves.toBe(expected);
  });

  test("uses only the first event", async () => {
    respond([lesson("DS (L) | Şəbnəm | 6-606"), lesson("PH (M) | Əyyub | 6-404")]);
    await expect(new GoogleCalendarService().getNextLesson(9, 0)).resolves.toContain("DS (L)");
  });

  test("skips all-day events", async () => {
    respond([
      { summary: "Holiday", start: { date: "2026-09-28" } },
      { summary: "DM (L) | Kamran | 3-401", start: { dateTime: "2026-09-28T09:00:00+04:00" } },
    ]);
    await expect(new GoogleCalendarService().getNextLesson(9, 0)).resolves.toContain("Discrete Mathematics");
  });

  test("returns null when there is only an all-day event", async () => {
    respond([{ summary: "Holiday", start: { date: "2026-09-28" } }]);
    await expect(new GoogleCalendarService().getNextLesson(9, 0)).resolves.toBeNull();
  });

  test("returns null without a lesson", async () => {
    respond([]);
    await expect(new GoogleCalendarService().getNextLesson(12, 0)).resolves.toBeNull();
  });

  test("returns null for an event without a title", async () => {
    respond([lesson()]);
    await expect(new GoogleCalendarService().getNextLesson(12, 0)).resolves.toBeNull();
  });
});
