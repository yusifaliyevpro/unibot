import * as dotenv from "dotenv";
dotenv.config({ path: ".env", quiet: true });

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const groups = {
  UNICHAT: getEnvVar("UNICHAT_GROUP_ID"),
  INFORMATION: getEnvVar("INFORMATION_GROUP_ID"),
  TEST: getEnvVar("TEST_GROUP_ID"),
  LOG: getEnvVar("LOG_GROUP_ID"),
  FINAL_EXAM: getEnvVar("FINAL_EXAM_GROUP_ID"),
};

export const SuperAdminID = getEnvVar("SUPER_ADMIN_PHONE_NUMBER");
export const UniBotID = getEnvVar("UNIBOT_PHONE_NUMBER");

type Time = `${number}:${number}`;
type Lesson = { start: Time; end: Time };

const REMINDER_MINUTES_BEFORE = 15;

// Lesson days of the semester: 5 = Monday-Friday, 4 = Monday-Thursday
export const SCHOOL_DAYS = 5;
const SCHOOL_DAYS_CRON = `1-${SCHOOL_DAYS}`;

/** Cron expression at `time` minus `minutesBefore` on the given weekdays */
function cronAt(time: Time, days: string, minutesBefore = 0) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute - minutesBefore;
  return `${total % 60} ${Math.floor(total / 60)} * * ${days}`;
}

/** Derives every shift dependent time from the day's 3 lessons */
function createShift(lessons: [Lesson, Lesson, Lesson]) {
  return {
    /** calendar window of a day's lessons */
    start: lessons[0].start,
    end: lessons[2].end,
    lastSlotStart: lessons[2].start,
    /** door number of `lesson` is sent to UNICHAT at `cron` */
    doorReminders: lessons.map((l) => ({ cron: cronAt(l.start, SCHOOL_DAYS_CRON, REMINDER_MINUTES_BEFORE), lesson: l.start })),
    /** tomorrow's schedule is posted when the 2nd lesson ends if there's no 3rd one, otherwise when the 3rd ends */
    scheduleCrons: { beforeLastSlot: cronAt(lessons[1].end, SCHOOL_DAYS_CRON), afterLastSlot: cronAt(lessons[2].end, SCHOOL_DAYS_CRON) },
  };
}

export const SHIFTS = {
  // Səhər növbəsi
  morning: createShift([
    { start: "09:00", end: "10:20" },
    { start: "10:30", end: "11:50" },
    { start: "12:00", end: "13:20" },
  ]),
  // Günorta növbəsi
  afternoon: createShift([
    { start: "13:35", end: "14:55" },
    { start: "15:05", end: "16:25" },
    { start: "16:35", end: "17:55" },
  ]),
};

// Change this when the university shift changes
export const SHIFT = SHIFTS.morning;
