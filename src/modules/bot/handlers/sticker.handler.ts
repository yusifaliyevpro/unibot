import axios from "axios";
import sharp from "sharp";
import { ENV } from "../../../lib/env.js";
import { sendErrorLog, sendLog } from "../../../lib/logger.js";
import { LogMessages, userFriendlyMessages } from "../../../lib/logger_messages.js";
import { type Chat, type Message, MessageMedia, MessageTypes } from "../../../lib/whatsapp.ts";

export async function handleSticker(msg: Message, chat: Chat) {
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

      // The image goes inline as a data URL, shrunk to stay far below Vercel's 4.5 MB request limit
      let imageURL = "";
      if (quotedMsg.hasMedia && quotedMsg.type === MessageTypes.IMAGE) {
        const image = await quotedMsg.downloadMedia();
        const jpeg = await sharp(Buffer.from(image.data, "base64"))
          .rotate()
          .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        imageURL = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
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
  }
}

const MAX_IMAGE_SIZE = 1024;

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
