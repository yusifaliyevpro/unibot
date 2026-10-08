import { TIME_ZONE, UPPER_WEEKS } from "./constants.js";

/** Whether `phrase` appears in `text` as whole words (not followed/preceded by a letter or digit) */
export function hasPhrase(text: string, phrase: string) {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

function hasWord(message: string, words: string[]) {
  return words.some((word) => hasPhrase(message, word));
}

export function isSalam(message: string) {
  return hasWord(message, ["salam", "salamm", "salammm", "hi", "hii", "hello", "welcome", "salams"]);
}

export function isLion(message: string) {
  return hasWord(message, ["şir", "alex", "alec", "aslan", "leo", "lion", "unibot"]);
}

export const commands = {
  isSchedule: "/schedule",
  isForTomorrow: "/tomorrow",
  isUpper: "/upper",
  isLower: "/lower",
  // isClear: "/clear",
  isHelp: "/help",
  // isCat: "/cat",
  // isAddTask: "/add",
  // isTasks: "/tasks",
  // isWiki: "/wiki",
  // isCode: "/code",
  isEcho: "/echo",
  isStart: "/start",
  isQuit: "/quit",
  isPass: "/pass",
  // isLink: "/link",
  // isQR: "/qr",
  isSticker: "/s",
  isConfirm: "/confirm",
  isUniBot: "/unibot",
  // isRegister: "/reg",
  isRight: "✅",
  // isForwardToTeacher: "/fw",
  // isMap: "/map",
  isPDF: "/pdf",
  // isDownlaod: "/d",
} as const;

/** A "/command" only counts as its own word, so "/start" isn't "/s" and links like "https://x.com/pdf" aren't commands */
function hasCommand(body: string, cmd: string) {
  if (!cmd.startsWith("/")) return body.includes(cmd);
  return body.split(/\s+/).some((word) => word.replace(/[.,!?]+$/, "") === cmd);
}

export function getCommand(body: string) {
  type Commands = Record<keyof typeof commands, boolean>;
  return Object.fromEntries(Object.entries(commands).map(([key, cmd]) => [key, hasCommand(body, cmd)])) as Commands;
}

/** Message text addressed to the bot, without @mentions and the /unibot command */
export function cleanPrompt(text: string) {
  return text
    .replace(/@\d{9,15}/g, "")
    .replace(/(^|\s)\/unibot(?=\s|$)/gi, " ")
    .trim();
}

export function today() {
  return Temporal.Now.plainDateISO(TIME_ZONE);
}

/** A Google Calendar `dateTime` (RFC 3339, with offset) in the bot's time zone */
export function toZoned(dateTime: string) {
  return Temporal.Instant.from(dateTime).toZonedDateTimeISO(TIME_ZONE);
}

/** The first lesson day after `day`, i.e. Monday after the week's last one */
export function nextSchoolDay(day: Temporal.PlainDate, schoolDays: number) {
  let next = day.add({ days: 1 });
  while (next.dayOfWeek > schoolDays) next = next.add({ days: 1 });
  return next;
}

/** `day` at "HH:MM" in the bot's time zone */
export function atTime(day: Temporal.PlainDate, time: string) {
  return day.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from(time) });
}

/** Upper or lower week of `day`, by the parity of its ISO (Monday-started) week number */
export function weekType(day: Temporal.PlainDate, upperWeeks = UPPER_WEEKS): "upper" | "lower" {
  const isOdd = day.weekOfYear! % 2 === 1;
  return isOdd === (upperWeeks === "odd") ? "upper" : "lower";
}
