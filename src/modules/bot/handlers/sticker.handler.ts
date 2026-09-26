import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import sharp from "sharp";
import { ENV } from "../../../lib/env.js";
import { sendErrorLog, sendLog } from "../../../lib/logger.js";
import { LogMessages, userFriendlyMessages } from "../../../lib/logger_messages.js";
import { type Chat, type Message, MessageMedia, MessageTypes } from "../../../lib/whatsapp.ts";

export async function handleSticker(msg: Message, chat: Chat) {
  let tempImagePath = "";
  try {
    const quotedMsg = await msg.getQuotedMessage();
    if (quotedMsg.type === MessageTypes.IMAGE && !quotedMsg.body.trim()) {
      const tempStickerImage = await quotedMsg.downloadMedia();
      return await chat.sendMessage(tempStickerImage, stickerOptions("Image Sticker"));
    }

    if (quotedMsg.type === MessageTypes.TEXT || quotedMsg.type === MessageTypes.IMAGE) {
      const quotedContact = await quotedMsg.getContact();
      const text = quotedMsg.body.trim();
      const username = quotedContact.pushname;
      const avatar = (await quotedContact.getProfilePicUrl()) || "";

      let imageURL = "";

      // The sticker generator downloads the image itself, so it needs a public https url
      if (quotedMsg.hasMedia && quotedMsg.type === MessageTypes.IMAGE && ENV.PUBLIC_BASE_URL) {
        const image = await quotedMsg.downloadMedia();
        const fileName = `image_${Date.now()}.png`;
        tempImagePath = path.join("public", fileName);
        await fs.promises.writeFile(tempImagePath, Buffer.from(image.data, "base64"));

        imageURL = new URL(`/public/${fileName}`, ENV.PUBLIC_BASE_URL).href;
      }

      const json = {
        type: "quote",
        format: "png",
        backgroundColor: "#101D25",
        width: 512,
        height: 512,
        scale: 2,
        messages: [
          {
            entities: [],
            avatar: !!avatar,
            ...(imageURL ? { media: { url: imageURL } } : {}),
            from: {
              id: 1,
              name: username,
              photo: {
                url: avatar,
              },
            },
            text,
            replyMessage: quotedMsg.hasQuotedMsg ? await replyBubble(await quotedMsg.getQuotedMessage()) : {},
          },
        ],
      };
      type StickerResponse = { data: { image: string; width: number; height: number; type: string } };
      const response = await axios.post<StickerResponse>(ENV.STICKER_BASE_URL, json, { headers: { "Content-Type": "application/json" } });

      const buffer = Buffer.from(response.data.data.image, "base64");

      // Separate pipelines: sharp always resizes before extending within one
      const padded = await sharp(buffer)
        .extend({
          right: 20,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();
      const resizedSticker = await sharp(padded)
        .resize({
          width: 512,
          height: 512,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp()
        .toBuffer();

      const sticker = new MessageMedia("image/webp", resizedSticker.toString("base64"));
      await chat.sendMessage(sticker, stickerOptions(text));
      await msg.react("✅");

      await sendLog(LogMessages.STICKER_HANDLER, msg);
    } else {
      await msg.react("❌");
      await msg.reply(userFriendlyMessages.STICKER_ONLY_TEXT_AND_IMAGE);
    }
  } catch (error: unknown) {
    await sendErrorLog(LogMessages.STICKER_HANDLER, msg, error);
  } finally {
    if (tempImagePath) await fs.promises.unlink(tempImagePath).catch(() => {});
  }
}

/** The "replying to" bubble shows the author and text of the message the quoted one replied to */
async function replyBubble(repliedTo: Message) {
  return { name: (await repliedTo.getContact()).pushname, text: repliedTo.body, chatId: 5 };
}

const stickerOptions = (stickerName: string) => ({
  sendMediaAsSticker: true,
  stickerAuthor: "UniBot - YusifAliyevPro",
  stickerName,
  stickerCategories: ["whatsapp message bubble", "message", "bubble"],
});
