import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as sharp from "sharp";
import { BASE_URL, isInDev } from "@/lib/constants";
import { ENV } from "@/lib/env";
import { sendErrorLog, sendLog } from "@/lib/logger";
import { LogMessages, userFriendlyMessages } from "@/lib/logger_messages";
import { Chat, Message, MessageMedia, MessageTypes } from "whatsapp-web.js";

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

      let base64URL = "";

      if (quotedMsg.hasMedia && quotedMsg.type === MessageTypes.IMAGE) {
        const image = await quotedMsg.downloadMedia();
        const base64Image = image.data;
        const fileName = `image_${Date.now()}.png`;
        const filePath = path.join("public", fileName);
        await fs.promises.writeFile(filePath, Buffer.from(base64Image, "base64"));

        base64URL = `${BASE_URL}/public/${fileName}`;
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
            ...(base64URL && !isInDev ? { media: { url: base64URL } } : {}),
            from: {
              id: 1,
              name: username,
              photo: {
                url: avatar,
              },
            },
            text,
            replyMessage: quotedMsg.hasQuotedMsg
              ? {
                  name: (await quotedMsg.getContact()).pushname,
                  text: (await quotedMsg.getQuotedMessage()).body,
                  chatId: 5,
                }
              : {},
          },
        ],
      };
      type StickerResponse = { data: { image: string; width: number; height: number; type: string } };
      const response = await axios.post<StickerResponse>(ENV.STICKER_BASE_URL, json, { headers: { "Content-Type": "application/json" } });

      const buffer = Buffer.from(response.data.data.image, "base64");

      const resizedSticker = await sharp(buffer)
        .extend({
          right: 20,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
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

      if (base64URL) await fs.promises.unlink(path.join("public", path.basename(base64URL))).catch(() => {});
    } else {
      await msg.react("❌");
      await msg.reply(userFriendlyMessages.STICKER_ONLY_TEXT_AND_IMAGE);
    }
  } catch (error: unknown) {
    await sendErrorLog(LogMessages.STICKER_HANDLER, msg, error);
  }
}

const stickerOptions = (stickerName: string) => ({
  sendMediaAsSticker: true,
  stickerAuthor: "UniBot - YusifAliyevPro",
  stickerName,
  stickerCategories: ["whatsapp message bubble", "message", "bubble"],
});
