import { describe, expect, test } from "vitest";
import { atTime, commands, getCommand, isLion, isSalam, nextSchoolDay, tomorrow } from "../../src/lib/utils.ts";

describe("isSalam", () => {
  test.for(["salam", "Salam!", "hi", "HI there", "hello, world", "salam.", "hey hii", "welcome?", "salams", "salam😊", "ok salam"])(
    "detects greeting in %j",
    (message) => {
      expect(isSalam(message)).toBe(true);
    },
  );

  test.for(["", "salamlar", "this", "hint", "ahello", "shallow", "no greeting here"])("ignores %j", (message) => {
    expect(isSalam(message)).toBe(false);
  });
});

describe("isLion", () => {
  test.for(["şir", "Şir!", "Leo", "the lion.", "unibot?", "hey aslan", "alex", "alec,"])("detects %j", (message) => {
    expect(isLion(message)).toBe(true);
  });

  test.for(["", "leopard", "alexander", "lions", "unibots", "şirin"])("ignores %j", (message) => {
    expect(isLion(message)).toBe(false);
  });
});

describe("tomorrow", () => {
  test("moves to the next day", () => {
    expect(tomorrow(new Date(2026, 8, 26, 10, 30))).toEqual(new Date(2026, 8, 27, 10, 30));
  });

  test("rolls over month and year ends", () => {
    expect(tomorrow(new Date(2026, 8, 30))).toEqual(new Date(2026, 9, 1));
    expect(tomorrow(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1));
  });
});

describe("nextSchoolDay", () => {
  // Sep 28 2026 is a Monday
  test.for([
    ["Monday", "2026-09-28", 5, "2026-09-29"],
    ["Thursday in a 5 day week", "2026-10-01", 5, "2026-10-02"],
    ["Friday in a 5 day week", "2026-10-02", 5, "2026-10-05"],
    ["Thursday in a 4 day week", "2026-10-01", 4, "2026-10-05"],
    ["Saturday", "2026-10-03", 5, "2026-10-05"],
    ["Sunday", "2026-10-04", 5, "2026-10-05"],
    ["the last Friday of a year", "2026-12-25", 5, "2026-12-28"],
  ] as const)("after a %s", ([, day, schoolDays, expected]) => {
    const next = nextSchoolDay(new Date(`${day}T12:00:00`), schoolDays);
    expect(next.toLocaleDateString("sv-SE")).toBe(expected);
  });

  test("does not mutate the given date", () => {
    const day = new Date(2026, 9, 2, 12);
    nextSchoolDay(day, 5);
    expect(day).toEqual(new Date(2026, 9, 2, 12));
  });
});

describe("atTime", () => {
  test("sets hours and minutes, zeroing seconds", () => {
    expect(atTime(new Date(2026, 8, 28, 15, 45, 12, 500), "09:05")).toEqual(new Date(2026, 8, 28, 9, 5, 0, 0));
  });

  test("does not mutate the given date", () => {
    const day = new Date(2026, 8, 28, 15, 45);
    atTime(day, "13:20");
    expect(day).toEqual(new Date(2026, 8, 28, 15, 45));
  });
});

const onlyTrue = (body: string) =>
  Object.entries(getCommand(body))
    .filter(([, value]) => value)
    .map(([key]) => key);

describe("getCommand", () => {
  test("returns a boolean for every command", () => {
    expect(Object.keys(getCommand(""))).toEqual(Object.keys(commands));
    expect(onlyTrue("")).toEqual([]);
  });

  test.for([
    ["/help", ["isHelp"]],
    ["/help @az", ["isHelp"]],
    ["/schedule", ["isSchedule"]],
    ["/schedule /tomorrow", ["isSchedule", "isForTomorrow"]],
    ["/schedule 3 /upper", ["isSchedule", "isUpper"]],
    ["/schedule 3 /lower", ["isSchedule", "isLower"]],
    ["/s", ["isSticker"]],
    ["/pdf", ["isPDF"]],
    ["/start", ["isStart"]],
    ["/start 12", ["isStart"]],
    ["/pass", ["isPass"]],
    ["/quit", ["isQuit"]],
    ["/echo hello", ["isEcho"]],
    ["/confirm", ["isConfirm"]],
    ["✅", ["isRight"]],
    ["düzdür ✅", ["isRight"]],
    ["please /help!", ["isHelp"]],
  ] as const)("%j matches %j", ([body, expected]) => {
    expect(onlyTrue(body)).toEqual(expected);
  });

  test.for(["/start", "/schedule", "/stop", "/sticker"])("%j does not trigger the sticker command", (body) => {
    expect(getCommand(body).isSticker).toBe(false);
  });

  test.for(["https://sites.google.com/pdf", "see http://x.com/start/quit", "a/help", "/helpme", "/pdfs", "/echoes"])(
    "%j contains no command",
    (body) => {
      expect(onlyTrue(body)).toEqual([]);
    },
  );
});
