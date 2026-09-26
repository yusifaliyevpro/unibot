/** Whether any of `words` appears as a whole word (not followed/preceded by a letter or digit) */
function hasWord(message: string, words: string[]) {
  return words.some((word) => new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "iu").test(message));
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
