export function isSalam(message: string) {
  const words = ["salam", "salamm", "salammm", "hi", "hii", "hello", "welcome", "salams"];
  return words.some((word) => {
    const regex = new RegExp(`(^|\\s)${word}(\\.|\\,|\\!|\\?|\\s|$)`, "i");
    return regex.test(message);
  });
}

export function isLion(message: string) {
  const words = ["şir", "alex", "alec", "aslan", "leo", "lion", "unibot"];
  return words.some((word) => {
    const regex = new RegExp(`(^|\\s)${word}(\\.|\\,|\\!|\\?|\\s|$)`, "i");

    return regex.test(message);
  });
}

export function tomorrow(day: Date) {
  day.setDate(day.getDate() + 1);
  return day;
}

export const commands = {
  isSchedule: "/schedule",
  isForTomorrow: "/tomorrow",
  isClear: "/clear",
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
  isRegister: "/reg",
  isRight: "✅",
  isForwardToTeacher: "/fw",
  // isMap: "/map",
  isPDF: "/pdf",
  // isDownlaod: "/d",
} as const;

export function getCommand(body: string) {
  type Commands = Record<keyof typeof commands, boolean>;
  return Object.fromEntries(Object.entries(commands).map(([key, cmd]) => [key, body.includes(cmd)])) as Commands;
}
