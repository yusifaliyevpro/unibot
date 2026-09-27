import { Logger } from "@nestjs/common";
import axios from "axios";
import sharp from "sharp";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userFriendlyMessages } from "../../../../src/lib/logger_messages.ts";
import { MessageMedia, type MessageTypes } from "../../../../src/lib/whatsapp.ts";
import { type FakeMessage, fakeChat, fakeMessage } from "../../../fakes.ts";

vi.mock(import("axios"), () => ({ default: { post: vi.fn() } }) as never);

const STICKER_OPTIONS = {
  sendMediaAsSticker: true,
  stickerAuthor: "UniBot - YusifAliyevPro",
  stickerCategories: ["whatsapp message bubble", "message", "bubble"],
};

let quotePng: Buffer;

async function load() {
  vi.resetModules();
  const { default: client } = await import("../../../../src/modules/bot/client.ts");
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  const { handleSticker } = await import("../../../../src/modules/bot/handlers/sticker.handler.ts");
  return { handleSticker, client };
}

beforeEach(async () => {
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  quotePng ??= await sharp({ create: { width: 400, height: 200, channels: 4, background: "#101D25" } })
    .png()
    .toBuffer();
  vi.mocked(axios.post)
    .mockReset()
    .mockResolvedValue({ data: { data: { image: quotePng.toString("base64"), width: 400, height: 200, type: "quote" } } });
});

function command(quoted: FakeMessage) {
  const chat = fakeChat({ isGroup: true });
  const msg = fakeMessage({ body: "/s", quoted, chat });
  return { chat, msg };
}

const quotePayload = () => vi.mocked(axios.post).mock.calls[0][1] as { messages: Record<string, unknown>[] };

const jpeg = async (width: number, height: number) =>
  new MessageMedia(
    "image/jpeg",
    (
      await sharp({ create: { width, height, channels: 3, background: "#3366ff" } })
        .jpeg()
        .toBuffer()
    ).toString("base64"),
  );

/** The image the quote payload carries inline, decoded */
async function quotedImage() {
  const { url } = quotePayload().messages[0].media as { url: string };
  expect(url).toMatch(/^data:image\/jpeg;base64,/);
  return await sharp(Buffer.from(url.slice(url.indexOf(",") + 1), "base64")).metadata();
}

describe("handleSticker", () => {
  test("turns a quoted text into a quote sticker", async () => {
    const { handleSticker, client } = await load();
    const quoted = fakeMessage({ body: "  Exam is tomorrow!  ", pushname: "Ali", profilePicUrl: "https://pps.whatsapp.net/ali.jpg" });
    const { chat, msg } = command(quoted);

    await handleSticker(msg, chat);

    expect(axios.post).toHaveBeenCalledExactlyOnceWith(
      "https://sticker.example.com",
      {
        type: "quote",
        format: "png",
        backgroundColor: "#101D25",
        width: 512,
        height: 512,
        scale: 2,
        messages: [
          {
            entities: [],
            avatar: true,
            from: { id: 1, name: "Ali", photo: { url: "https://pps.whatsapp.net/ali.jpg" } },
            text: "Exam is tomorrow!",
            replyMessage: {},
          },
        ],
      },
      { headers: { "Content-Type": "application/json" } },
    );
    const [sticker, options] = chat.sendMessage.mock.calls[0];
    expect(options).toEqual({ ...STICKER_OPTIONS, stickerName: "Exam is tomorrow!" });
    expect(sticker).toMatchObject({ mimetype: "image/webp" });
    const meta = await sharp(Buffer.from((sticker as MessageMedia).data, "base64")).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(msg.react).toHaveBeenCalledWith("✅");
    expect(client.sendMessage).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("*STICKER_HANDLER*"));
  });

  test("shows who the quoted message was replying to", async () => {
    const { handleSticker } = await load();
    const original = fakeMessage({ body: "When is the exam?", pushname: "Vali" });
    const quoted = fakeMessage({ body: "Tomorrow", pushname: "Ali", quoted: original });
    const { chat, msg } = command(quoted);

    await handleSticker(msg, chat);

    expect(quotePayload().messages[0].replyMessage).toEqual({ name: "Vali", text: "When is the exam?", chatId: 5 });
  });

  test("works without a profile picture", async () => {
    const { handleSticker } = await load();
    const { chat, msg } = command(fakeMessage({ body: "hi", pushname: "Ali" }));
    await handleSticker(msg, chat);
    expect(quotePayload().messages[0]).toMatchObject({ avatar: false, from: { photo: { url: "" } } });
  });

  test("sends a plain quoted image as an image sticker", async () => {
    const { handleSticker } = await load();
    const media = new MessageMedia("image/jpeg", Buffer.from("jpeg").toString("base64"));
    const { chat, msg } = command(fakeMessage({ type: "image", hasMedia: true, media }));

    await handleSticker(msg, chat);

    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith(media, { ...STICKER_OPTIONS, stickerName: "Image Sticker" });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("puts a captioned image into the quote inline, shrunk to 1024px", async () => {
    const { handleSticker } = await load();
    const { chat, msg } = command(fakeMessage({ type: "image", hasMedia: true, media: await jpeg(3000, 2000), body: "look at this" }));

    await handleSticker(msg, chat);

    expect(await quotedImage()).toMatchObject({ format: "jpeg", width: 1024, height: 683 });
    expect(quotePayload().messages[0].text).toBe("look at this");
    expect(chat.sendMessage).toHaveBeenCalledOnce();
  });

  test("keeps small images at their size", async () => {
    const { handleSticker } = await load();
    const { chat, msg } = command(fakeMessage({ type: "image", hasMedia: true, media: await jpeg(400, 300), body: "small" }));

    await handleSticker(msg, chat);

    expect(await quotedImage()).toMatchObject({ width: 400, height: 300 });
  });

  test("reports an image it cannot read", async () => {
    const { handleSticker } = await load();
    const media = new MessageMedia("image/jpeg", Buffer.from("not an image").toString("base64"));
    const { chat, msg } = command(fakeMessage({ type: "image", hasMedia: true, media, body: "look" }));

    await handleSticker(msg, chat);

    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(axios.post).not.toHaveBeenCalled();
  });

  test.for(["video", "document", "sticker", "audio", "ptt"] as MessageTypes[])("refuses a quoted %s", async (type) => {
    const { handleSticker } = await load();
    const { chat, msg } = command(fakeMessage({ type, hasMedia: true }));

    await handleSticker(msg, chat);

    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(msg.reply).toHaveBeenCalledWith(userFriendlyMessages.STICKER_ONLY_TEXT_AND_IMAGE);
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test("reports sticker api failures", async () => {
    const { handleSticker, client } = await load();
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("502"));
    const { chat, msg } = command(fakeMessage({ body: "hi" }));

    await handleSticker(msg, chat);

    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^🔴 .*\*STICKER_HANDLER\*/));
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});
