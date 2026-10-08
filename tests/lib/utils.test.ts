import { afterEach, describe, expect, test, vi } from "vitest";
import { UPPER_WEEKS } from "../../src/lib/constants.ts";
import {
  atTime,
  cleanPrompt,
  commands,
  getCommand,
  hasPhrase,
  isLion,
  isSalam,
  nextSchoolDay,
  today,
  toZoned,
  weekType,
} from "../../src/lib/utils.ts";

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

describe("today", () => {
  afterEach(() => vi.useRealTimers());

  test("is the Baku calendar day, not UTC", () => {
    vi.useFakeTimers({ toFake: ["Temporal"] });
    // Monday 00:30 in Baku is still Sunday in UTC
    vi.setSystemTime("2026-10-05T00:30:00+04:00");
    expect(today().toString()).toBe("2026-10-05");
  });
});

describe("toZoned", () => {
  test.for([
    ["2026-09-28T09:00:00+04:00", "2026-09-28T09:00:00+04:00[Asia/Baku]"],
    ["2026-09-28T05:00:00Z", "2026-09-28T09:00:00+04:00[Asia/Baku]"],
    ["2026-09-27T22:30:00Z", "2026-09-28T02:30:00+04:00[Asia/Baku]"],
  ])("%s is %s", ([dateTime, expected]) => {
    expect(toZoned(dateTime).toString()).toBe(expected);
  });
});

describe("cleanPrompt", () => {
  test.for([
    ["@994500000001 what is a monad?", "what is a monad?"],
    ["  @994500000001  hi  @100000000000001 ", "hi"],
    ["/unibot next monday's schedule", "next monday's schedule"],
    ["/UniBot  tomorrow?", "tomorrow?"],
    ["hey /unibot", "hey"],
    ["/unibot", ""],
    ["@994500000001", ""],
    ["see /unibotics and x/unibot", "see /unibotics and x/unibot"],
    ["call 12345678 now", "call 12345678 now"],
  ])("%j becomes %j", ([text, expected]) => {
    expect(cleanPrompt(text)).toBe(expected);
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
    expect(nextSchoolDay(Temporal.PlainDate.from(day), schoolDays).toString()).toBe(expected);
  });
});

describe("atTime", () => {
  test("is the day at that time in Baku", () => {
    expect(atTime(Temporal.PlainDate.from("2026-09-28"), "09:05").toString()).toBe("2026-09-28T09:05:00+04:00[Asia/Baku]");
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
    ["/unibot what is tomorrow", ["isUniBot"]],
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

describe("hasPhrase", () => {
  test.for([
    ["bakı", "bakı"],
    ["məncə bakı şəhəridir", "bakı"],
    ["qız qalası!", "qız qalası"],
    ["it is c++", "c++"],
    ["(a) and (b)", "(a)"],
  ])("%j contains %j", ([text, phrase]) => {
    expect(hasPhrase(text, phrase)).toBe(true);
  });

  test.for([
    ["bakının", "bakı"],
    ["abakı", "bakı"],
    ["a b c", "a.b"],
    ["qız qalasında", "qız qalası"],
    ["anything", ""],
  ])("%j does not contain %j", ([text, phrase]) => {
    expect(hasPhrase(text, phrase)).toBe(false);
  });
});

describe("weekType", () => {
  // Sep 28 - Oct 4 2026 is ISO week 40, Oct 5 - 11 is week 41
  test.for([
    ["a Monday", "2026-09-28", "even", "upper"],
    ["a Sunday, which ends its Monday-started week", "2026-10-04", "even", "upper"],
    ["the next Monday", "2026-10-05", "even", "lower"],
    ["a Monday with odd upper weeks", "2026-09-28", "odd", "lower"],
    ["the next Monday with odd upper weeks", "2026-10-05", "odd", "upper"],
  ] as const)("%s (%s) with %s upper weeks is %s", ([, day, upperWeeks, expected]) => {
    expect(weekType(Temporal.PlainDate.from(day), upperWeeks)).toBe(expected);
  });

  test("defaults to the semester's UPPER_WEEKS", () => {
    const day = Temporal.PlainDate.from("2026-09-28");
    expect(weekType(day)).toBe(weekType(day, UPPER_WEEKS));
  });
});
