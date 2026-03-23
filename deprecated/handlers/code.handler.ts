// import { Chat, Message, MessageMedia } from "whatsapp-web.js";
// import { sendErrorLog, sendLog } from "@/lib/logger";
// import client from "../client";
// import { LogMessages } from "@/lib/logger_messages";

// export async function handleCode(chat: Chat, msg: Message) {
//   try {
//     await msg.react("⌛");

//     const code = msg.body;

//     const rayso_url = `https://ray.so/#code=${toBase64Unicode(code)}&padding=&background=true&title=${encodeURI(chat.name || "Codium")}&darkMode=true&language=&theme=raindrop`;
//     console.log(rayso_url);
//     const browser = client.pupBrowser;
//     if (!browser) {
//       throw new Error("Browser is not initialized");
//     }
//     const page = await browser.newPage();
//     await page.setViewport({ width: 8192 * 2, height: 2048 * 2, deviceScaleFactor: 4 });
//     await page.goto(rayso_url, { waitUntil: "networkidle2" });

//     await page.waitForSelector("body > div > main > div.code_app__D8hzR > div.Controls_controls__Tz_C5", { visible: true, timeout: 10000 });
//     const frameDiv = await page.$('div[class="ResizableFrame_resizableFrame__RZ6bb"]');

//     if (!frameDiv) throw new Error("There was no code frame!");

//     const screenshot = await frameDiv.screenshot({ type: "png" });
//     await page.close();

//     const media = new MessageMedia("image/png", screenshot.toString("base64"));

//     await chat.sendMessage(media);
//     await msg.react("✅");

//     await sendLog(LogMessages.CODE_IMAGE, msg);
//   } catch (error) {
//     await sendErrorLog(LogMessages.CODE_IMAGE, msg, error);
//   }
// }

// function toBase64Unicode(str: string): string {
//   return Buffer.from(str, "utf-8").toString("base64");
// }
