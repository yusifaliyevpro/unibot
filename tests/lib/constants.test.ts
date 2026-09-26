import { beforeEach, describe, expect, test, vi } from "vitest";

const loadConstants = async () => await import("../../src/lib/constants.ts");

beforeEach(() => {
  vi.resetModules();
});

describe("env derived constants", () => {
  test("reads group and user ids from the environment", async () => {
    const { groups, SuperAdminID, UniBotID } = await loadConstants();
    expect(groups).toEqual({
      UNICHAT: "111111111111111111@g.us",
      INFORMATION: "222222222222222222@g.us",
      TEST: "333333333333333333@g.us",
      LOG: "444444444444444444@g.us",
      FINAL_EXAM: "555555555555555555@g.us",
    });
    expect(SuperAdminID).toBe("994500000002@s.whatsapp.net");
    expect(UniBotID).toBe("994500000001@s.whatsapp.net");
  });

  test("uses the localhost url outside production", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    const { isInDev, BASE_URL } = await loadConstants();
    expect(isInDev).toBe(true);
    expect(BASE_URL).toBe("http://localhost:3000");
  });

  test("uses the railway url in production", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    const { isInDev, BASE_URL } = await loadConstants();
    expect(isInDev).toBe(false);
    expect(BASE_URL).toBe("https://unibot.example.com");
  });

  test.for(["UNICHAT_GROUP_ID", "LOG_GROUP_ID", "SUPER_ADMIN_PHONE_NUMBER", "UNIBOT_PHONE_NUMBER"])(
    "throws when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      await expect(loadConstants()).rejects.toThrow(`Missing required environment variable: ${name}`);
    },
  );
});

describe("shifts", () => {
  test("morning shift times", async () => {
    const { SHIFTS } = await loadConstants();
    expect(SHIFTS.morning).toEqual({
      start: "09:00",
      end: "13:20",
      lastSlotStart: "12:00",
      doorReminders: [
        { cron: "45 8 * * 1-5", lesson: "09:00" },
        { cron: "15 10 * * 1-5", lesson: "10:30" },
        { cron: "45 11 * * 1-5", lesson: "12:00" },
      ],
      scheduleCrons: { beforeLastSlot: "50 11 * * 1-5", afterLastSlot: "20 13 * * 1-5" },
    });
  });

  test("afternoon shift times", async () => {
    const { SHIFTS } = await loadConstants();
    expect(SHIFTS.afternoon).toEqual({
      start: "13:35",
      end: "17:55",
      lastSlotStart: "16:35",
      doorReminders: [
        { cron: "20 13 * * 1-5", lesson: "13:35" },
        { cron: "50 14 * * 1-5", lesson: "15:05" },
        { cron: "20 16 * * 1-5", lesson: "16:35" },
      ],
      scheduleCrons: { beforeLastSlot: "25 16 * * 1-5", afterLastSlot: "55 17 * * 1-5" },
    });
  });

  test("lessons are Monday to Friday this semester", async () => {
    const { SCHOOL_DAYS } = await loadConstants();
    expect(SCHOOL_DAYS).toBe(5);
  });

  test("the active shift is the morning one", async () => {
    const { SHIFT, SHIFTS } = await loadConstants();
    expect(SHIFT).toBe(SHIFTS.morning);
  });
});
