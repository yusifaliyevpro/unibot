import { getISOWeek } from "date-fns";
import { UPPER_WEEKS } from "./constants.js";

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

export function tomorrow(day: Date) {
  day.setDate(day.getDate() + 1);
  return day;
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

/** The first lesson day after `day`, i.e. Monday after the week's last one */
export function nextSchoolDay(day: Date, schoolDays: number) {
  const next = tomorrow(new Date(day));
  while (next.getDay() === 0 || next.getDay() > schoolDays) next.setDate(next.getDate() + 1);
  return next;
}

/** Copy of `day` with the time set to "HH:MM" */
export function atTime(day: Date, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(new Date(day).setHours(hour, minute, 0, 0));
}

/** Upper or lower week of `day`, by the parity of its Monday-started week number */
export function weekType(day: Date, upperWeeks = UPPER_WEEKS): "upper" | "lower" {
  const isOdd = getISOWeek(day) % 2 === 1;
  return isOdd === (upperWeeks === "odd") ? "upper" : "lower";
}
