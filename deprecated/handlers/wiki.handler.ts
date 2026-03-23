// import wiki from "wikipedia";
// import WAWebJS, { Chat, MessageMedia } from "whatsapp-web.js";
// import { sendErrorLog, sendLog } from "@/lib/logger";
// import { LogMessages } from "@/lib/logger_messages";

// export async function handleWiki(chat: Chat, msg: WAWebJS.Message, body: string) {
//   try {
//     const lang = body.includes("@az") ? "az" : body.includes("@tr") ? "tr" : "en";
//     wiki.setLang(lang);
//     await msg.react("🔍");
//     const searchTerm = msg.body.replace(/\/wiki\s*|@all|@az|@en|@tr/gi, "").trim();
//     if (!searchTerm) return await chat.sendMessage("Please provide a search term.");

//     const response = await wiki.search(searchTerm, { suggestion: true });
//     const firstResult = response.results[0] as { ns: number; title: string; pageid: number };
//     if (!firstResult) return await chat.sendMessage("There is no wikipedia page about your search term");

//     const page = await wiki.page(firstResult.title);
//     const summary = await page.summary();
//     const plainContent = `*Title: ${page.title}*\n\n${await page.content()}`;
//     if (summary.originalimage) {
//       const media = await MessageMedia.fromUrl(summary.originalimage.source);
//       await chat.sendMessage(media);
//     }
//     await chat.sendMessage(plainContent);

//     await sendLog(LogMessages.WIKI_HANDLER + ` | Search: "${searchTerm}"`, msg);
//   } catch (error) {
//     await sendErrorLog(LogMessages.WIKI_HANDLER, msg, error);
//   }
// }
