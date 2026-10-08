import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AnyMessageContent, downloadMediaMessage, makeWASocket, proto, useMultiFileAuthState, type WAMessage } from "baileys";
import webp from "node-webpmux";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest";
import { Client, GroupChat, LocalAuth, type Message, MessageMedia } from "../../src/lib/whatsapp.ts";

vi.mock(import("baileys"), async (importOriginal) => ({
  ...(await importOriginal()),
  makeWASocket: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  downloadMediaMessage: vi.fn(),
}));

const NOW = "2026-09-28T09:00:00+04:00";
const NOW_S = Temporal.Instant.from(NOW).epochMilliseconds / 1000;
const BOT_PN = "994500000001@s.whatsapp.net";
const BOT_LID = "900000000000001@lid";
const GROUP = "120363000000000001@g.us";
const ALI_LID = "100000000000001@lid";
const ALI_PN = "994501111111@s.whatsapp.net";

type Payload = Record<string, unknown>;

function createSocket() {
  let sentCount = 0;
  const ev = new EventEmitter();
  return {
    ev,
    user: { id: "994500000001:7@s.whatsapp.net", lid: "900000000000001:7@lid", name: "UniBot" },
    sendMessage: vi.fn(
      async (jid: string, content: AnyMessageContent, _options?: { quoted?: WAMessage }): Promise<WAMessage | undefined> => ({
        key: { remoteJid: jid, id: `SENT${++sentCount}`, fromMe: true },
        message: "text" in content ? { conversation: content.text } : { imageMessage: {} },
        messageTimestamp: NOW_S,
      }),
    ),
    sendPresenceUpdate: vi.fn(async () => {}),
    readMessages: vi.fn(async () => {}),
    groupMetadata: vi.fn(async (jid: string) => ({
      id: jid,
      subject: "UniChat",
      participants: [
        { id: "111111111111111@lid", admin: "superadmin" as const },
        { id: "222222222222222@lid", admin: "admin" as const },
        { id: "994503333333@s.whatsapp.net", lid: "333333333333333@lid", admin: null },
        { id: "994504444444@s.whatsapp.net", admin: null },
      ],
    })),
    profilePictureUrl: vi.fn(async () => "https://pps.whatsapp.net/pic.jpg"),
    updateMediaMessage: vi.fn(),
    signalRepository: {
      lidMapping: {
        getLIDForPN: vi.fn(
          async (pn: string): Promise<string | null> =>
            ({ [ALI_PN]: ALI_LID, [BOT_PN]: "900000000000001:0@lid", "994504444444@s.whatsapp.net": "444444444444444@lid" })[pn] ?? null,
        ),
      },
    },
  };
}

type FakeSocket = ReturnType<typeof createSocket>;

let sockets: FakeSocket[];
let authDir: string;
let saveCreds: Mock<() => Promise<void>>;

const sock = () => sockets.at(-1)!;

/** Runs every listener of a socket event and waits for them (they are async) */
async function fire(event: string, payload: unknown, socket = sock()) {
  await Promise.all(socket.ev.listeners(event).map((listener) => (listener as (p: unknown) => unknown)(payload)));
}

/** Closes the connection like Baileys does, optionally with a disconnect status code */
async function drop(statusCode?: number) {
  await fire("connection.update", {
    connection: "close",
    lastDisconnect: statusCode ? { error: { output: { statusCode } } } : undefined,
  });
}

async function connectedClient() {
  const client = new Client({ authStrategy: new LocalAuth(authDir) });
  await client.initialize();
  await fire("connection.update", { connection: "open" });
  return client;
}

let idCounter = 0;
function incoming(
  init: { jid?: string; participant?: string; message?: WAMessage["message"]; fromMe?: boolean; id?: string; ts?: number } & Payload = {},
): WAMessage {
  const {
    jid = ALI_LID,
    participant,
    message = { conversation: "hello" },
    fromMe = false,
    id = `IN${++idCounter}`,
    ts = NOW_S,
    key,
    ...rest
  } = init;
  return { key: { remoteJid: jid, id, fromMe, participant, ...(key as object) }, message, messageTimestamp: ts, ...rest } as WAMessage;
}

/** Delivers messages like Baileys does and returns what the client emitted */
async function deliver(client: Client, messages: WAMessage[], type: "notify" | "append" = "notify") {
  const emitted: Message[] = [];
  const listener = (msg: Message) => emitted.push(msg);
  client.on("message", listener);
  await fire("messages.upsert", { messages, type });
  client.off("message", listener);
  return emitted;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Temporal"] });
  vi.setSystemTime(NOW);
  sockets = [];
  authDir = await mkdtemp(join(tmpdir(), "unibot-auth-"));
  saveCreds = vi.fn();
  vi.mocked(makeWASocket).mockImplementation(() => {
    const socket = createSocket();
    sockets.push(socket);
    return socket as never;
  });
  vi.mocked(useMultiFileAuthState).mockResolvedValue({ state: {} as never, saveCreds });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("libsignal console noise", () => {
  test("drops session rotation logs and keeps everything else", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    await import("../../src/lib/whatsapp.ts");

    console.info("Closing session:", { privKey: "secret" });
    console.info("Opening session:", {});
    console.info("Removing old closed session:", {});
    console.warn("Session already closed", {});
    console.warn("Closing open session in favor of incoming prekey bundle");
    console.info("Migrating session to:", 2);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    console.info("Server started");
    console.warn({ not: "a string" });
    expect(info).toHaveBeenCalledWith("Server started");
    expect(warn).toHaveBeenCalledWith({ not: "a string" });
  });
});

describe("MessageMedia.fromUrl", () => {
  test("downloads the file with its mimetype and name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("png-bytes"), { headers: { "content-type": "image/png; charset=binary" } })),
    );
    const media = await MessageMedia.fromUrl("https://api.3sual.az/images/abc.png");
    expect(media).toEqual(new MessageMedia("image/png", Buffer.from("png-bytes").toString("base64"), "abc.png", 9));
  });

  test("falls back to a generic mimetype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2]), { headers: {} })),
    );
    const media = await MessageMedia.fromUrl("https://example.com/file");
    expect(media.mimetype).toBe("application/octet-stream");
  });

  test("throws on http errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(MessageMedia.fromUrl("https://example.com/missing.png")).rejects.toThrow("Failed to fetch media: 404");
  });
});

describe("connection lifecycle", () => {
  test("emits the qr code", async () => {
    const client = new Client({ authStrategy: new LocalAuth(authDir) });
    const qr = vi.fn();
    client.on("qr", qr);
    await client.initialize();
    await fire("connection.update", { qr: "2@abc" });
    expect(qr).toHaveBeenCalledWith("2@abc");
  });

  test("uses the auth folder and saves credential updates", async () => {
    await connectedClient();
    expect(useMultiFileAuthState).toHaveBeenCalledWith(authDir);
    await fire("creds.update", { me: {} });
    expect(saveCreds).toHaveBeenCalled();
  });

  test("defaults the auth folder to .baileys_auth", async () => {
    await new Client().initialize();
    expect(useMultiFileAuthState).toHaveBeenCalledWith(".baileys_auth");
  });

  test("becomes ready once and identifies itself by its LID", async () => {
    const client = new Client({ authStrategy: new LocalAuth(authDir) });
    const ready = vi.fn();
    const authenticated = vi.fn();
    client.on("ready", ready).on("authenticated", authenticated);
    await client.initialize();

    await fire("connection.update", { connection: "open" });
    await fire("connection.update", { connection: "open" });

    expect(authenticated).toHaveBeenCalledTimes(2);
    expect(ready).toHaveBeenCalledOnce();
    expect(client.info).toEqual({ wid: { _serialized: BOT_LID }, pushname: "UniBot" });
  });

  test("reconnects with a new socket after a non-fatal close", async () => {
    const client = await connectedClient();
    const disconnected = vi.fn();
    client.on("disconnected", disconnected);

    await fire("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 515 } } } });

    expect(makeWASocket).toHaveBeenCalledTimes(2);
    expect(client.sock).toBe(sockets[1]);
    expect(disconnected).not.toHaveBeenCalled();
  });

  describe("after a dropped connection", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Temporal", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(NOW);
    });

    test.for([undefined, 408, 428, 503])("reconnects after a delay (status %s)", async (statusCode) => {
      await connectedClient();
      await drop(statusCode);
      expect(makeWASocket).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1000);
      expect(makeWASocket).toHaveBeenCalledTimes(2);
    });

    test("waits longer after each failed attempt, up to a minute", async () => {
      await connectedClient();
      const waits: number[] = [];
      for (let attempt = 0; attempt < 8; attempt++) {
        const socketsBefore = vi.mocked(makeWASocket).mock.calls.length;
        await drop(408);
        let waited = 0;
        while (vi.mocked(makeWASocket).mock.calls.length === socketsBefore) {
          await vi.advanceTimersByTimeAsync(500);
          waited += 500;
        }
        waits.push(waited);
      }
      expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    });

    test("starts over with short waits once connected again", async () => {
      await connectedClient();
      await drop(408);
      await vi.advanceTimersByTimeAsync(1000);
      await drop(408);
      await vi.advanceTimersByTimeAsync(2000);
      await fire("connection.update", { connection: "open" });

      await drop(408);
      await vi.advanceTimersByTimeAsync(1000);
      expect(makeWASocket).toHaveBeenCalledTimes(4);
    });

    test("retries when reconnecting itself fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await connectedClient();
      vi.mocked(useMultiFileAuthState).mockRejectedValueOnce(new Error("disk full"));

      await drop(408);
      await vi.advanceTimersByTimeAsync(1000);
      expect(makeWASocket).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(2000);
      expect(makeWASocket).toHaveBeenCalledTimes(2);
    });

    test("does not reconnect when another session took over", async () => {
      const client = await connectedClient();
      const disconnected = vi.fn();
      client.on("disconnected", disconnected);

      await drop(440);
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(makeWASocket).toHaveBeenCalledOnce();
      expect(disconnected).not.toHaveBeenCalled();
    });
  });

  test("clears the session on logout and becomes ready again after re-pairing", async () => {
    await writeFile(join(authDir, "creds.json"), "{}");
    const client = new Client({ authStrategy: new LocalAuth(authDir) });
    const ready = vi.fn();
    const disconnected = vi.fn();
    client.on("ready", ready).on("disconnected", disconnected);
    await client.initialize();
    await fire("connection.update", { connection: "open" });

    await fire("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } });

    expect(existsSync(authDir)).toBe(false);
    expect(disconnected).toHaveBeenCalledWith("LOGOUT");
    expect(makeWASocket).toHaveBeenCalledOnce();

    await client.initialize();
    await fire("connection.update", { connection: "open" });
    expect(ready).toHaveBeenCalledTimes(2);
  });

  test("reports a bad session as an auth failure", async () => {
    const client = await connectedClient();
    const authFailure = vi.fn();
    const disconnected = vi.fn();
    client.on("auth_failure", authFailure).on("disconnected", disconnected);

    await fire("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 500 } } } });

    expect(authFailure).toHaveBeenCalledWith("Bad session");
    expect(disconnected).toHaveBeenCalledWith("BAD_SESSION");
    expect(existsSync(authDir)).toBe(false);
  });
});

describe("incoming messages", () => {
  test.for([
    ["text", { conversation: "hi there" }, { type: "chat", body: "hi there", hasMedia: false }],
    ["extended text", { extendedTextMessage: { text: "look" } }, { type: "chat", body: "look", hasMedia: false }],
    ["image", { imageMessage: { caption: "pic", fileLength: 2048 } }, { type: "image", body: "pic", hasMedia: true, size: 2048 }],
    ["video", { videoMessage: { fileLength: 10 } }, { type: "video", body: "", hasMedia: true, size: 10 }],
    ["audio", { audioMessage: {} }, { type: "audio", hasMedia: true }],
    ["voice note", { audioMessage: { ptt: true } }, { type: "ptt", hasMedia: true }],
    ["sticker", { stickerMessage: {} }, { type: "sticker", hasMedia: true }],
    ["document", { documentMessage: { fileName: "a.docx" } }, { type: "document", hasMedia: true }],
    [
      "document with caption",
      { documentWithCaptionMessage: { message: { documentMessage: { caption: "homework" } } } },
      { type: "document", body: "homework", hasMedia: true },
    ],
    ["disappearing text", { ephemeralMessage: { message: { conversation: "secret" } } }, { type: "chat", body: "secret" }],
    ["view once image", { viewOnceMessageV2: { message: { imageMessage: { caption: "once" } } } }, { type: "image", body: "once" }],
  ] as const)("parses %s", async ([, message, expected]) => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming({ message: message as WAMessage["message"] })]);
    expect(msg).toMatchObject({ hasQuotedMsg: false, fromMe: false, ...expected });
  });

  test("private message ids", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming({ id: "ABC" })]);
    expect(msg.id).toEqual({ _serialized: "ABC", id: "ABC", fromMe: false, remote: ALI_LID });
    expect(msg.from).toBe(ALI_LID);
    expect(msg.author).toBeUndefined();
  });

  test("group messages come from the group, authored by the member", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming({ jid: GROUP, participant: "222222222222222:3@lid" })]);
    expect(msg.from).toBe(GROUP);
    expect(msg.author).toBe("222222222222222@lid");
  });

  test.for([
    ["a LID as is", { jid: ALI_LID }, ALI_LID],
    ["the LID sent along a phone number", { jid: ALI_PN, key: { remoteJidAlt: "777777777777777@lid" } }, "777777777777777@lid"],
    ["a phone number mapped to its LID", { jid: ALI_PN }, ALI_LID],
    ["an unmapped phone number as the fallback", { jid: "994509999999@s.whatsapp.net" }, "994509999999@s.whatsapp.net"],
  ] as const)("identifies private senders by %s", async ([, init, expected]) => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming(init)]);
    expect(msg.from).toBe(expected);
  });

  test("falls back to the phone number when the LID lookup fails", async () => {
    const client = await connectedClient();
    sock().signalRepository.lidMapping.getLIDForPN.mockRejectedValueOnce(new Error("usync failed"));
    const [msg] = await deliver(client, [incoming({ jid: ALI_PN })]);
    expect(msg.from).toBe(ALI_PN);
  });

  test("resolves group authors sent by phone number", async () => {
    const client = await connectedClient();
    const [withAlt, mapped] = await deliver(client, [
      incoming({ jid: GROUP, participant: "994506666666@s.whatsapp.net", key: { participantAlt: "666666666666666@lid" } }),
      incoming({ jid: GROUP, participant: ALI_PN }),
    ]);
    expect(withAlt.author).toBe("666666666666666@lid");
    expect(mapped.author).toBe(ALI_LID);
  });

  test("resolves mentions to LIDs and detects quotes", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [
      incoming({
        jid: GROUP,
        participant: ALI_LID,
        message: {
          extendedTextMessage: {
            text: "@994500000001 hi",
            contextInfo: {
              mentionedJid: [BOT_PN, "222222222222222@lid"],
              stanzaId: "Q1",
              participant: ALI_LID,
              quotedMessage: { conversation: "old" },
            },
          },
        },
      }),
    ]);
    expect(msg.mentionedIds).toEqual([BOT_LID, "222222222222222@lid"]);
    expect(msg.hasQuotedMsg).toBe(true);
  });

  test("ignores own messages but keeps them for context", async () => {
    const client = await connectedClient();
    const emitted = await deliver(client, [incoming({ jid: GROUP, fromMe: true, message: { conversation: "bot reply" } })]);
    expect(emitted).toEqual([]);
    const chat = await client.getChatById(GROUP);
    expect((await chat.fetchMessages()).map((m) => m.body)).toEqual(["bot reply"]);
  });

  test("ignores non-live upserts", async () => {
    const client = await connectedClient();
    expect(await deliver(client, [incoming()], "append")).toEqual([]);
  });

  test.for([
    ["status updates", { jid: "status@broadcast" }],
    ["channel posts", { jid: "120363111111111111@newsletter" }],
    ["messages sent before the bot came online", { ts: NOW_S - 60 }],
    ["undecryptable messages", { message: null }],
    ["reactions", { message: { reactionMessage: { text: "👍" } } }],
    ["deletes and other protocol messages", { message: { protocolMessage: { type: 0 } } }],
    ["edits", { message: { editedMessage: { message: { conversation: "edited" } } } }],
    ["polls", { message: { pollCreationMessage: { name: "?" } } }],
    ["locations", { message: { locationMessage: {} } }],
  ] as const)("ignores %s", async ([, init]) => {
    const client = await connectedClient();
    expect(await deliver(client, [incoming(init as Payload)])).toEqual([]);
  });

  test("ignores re-deliveries of the same message", async () => {
    const client = await connectedClient();
    const first = await deliver(client, [incoming({ id: "DUP" })]);
    const again = await deliver(client, [incoming({ id: "DUP" })]);
    expect(first).toHaveLength(1);
    expect(again).toEqual([]);
  });

  test("handles a message that failed to decrypt once it is re-delivered", async () => {
    const client = await connectedClient();
    await deliver(client, [incoming({ id: "RETRY", message: null })]);
    const retried = await deliver(client, [incoming({ id: "RETRY", message: { conversation: "now readable" } })]);
    expect(retried.map((m) => m.body)).toEqual(["now readable"]);
  });

  test("emits every message of a batch in order", async () => {
    const client = await connectedClient();
    const emitted = await deliver(client, [incoming({ message: { conversation: "1" } }), incoming({ message: { conversation: "2" } })]);
    expect(emitted.map((m) => m.body)).toEqual(["1", "2"]);
  });
});

describe("read receipts", () => {
  test("marks every live incoming message as read in one go, handled or not", async () => {
    const client = await connectedClient();
    const text = incoming();
    const poll = incoming({ jid: GROUP, participant: ALI_LID, message: { pollCreationMessage: { name: "?" } } });
    await deliver(client, [text, poll]);
    expect(sock().readMessages).toHaveBeenCalledExactlyOnceWith([text.key, poll.key]);
  });

  test.for([
    ["own messages", { fromMe: true }],
    ["status updates", { jid: "status@broadcast" }],
    ["channel posts", { jid: "120363111111111111@newsletter" }],
    ["offline backlog", { ts: NOW_S - 1 }],
    ["undecryptable messages", { message: null }],
  ] as const)("does not mark %s", async ([, init]) => {
    const client = await connectedClient();
    await deliver(client, [incoming(init as Payload)]);
    expect(sock().readMessages).not.toHaveBeenCalled();
  });

  test("does not mark non-live upserts", async () => {
    const client = await connectedClient();
    await deliver(client, [incoming()], "append");
    expect(sock().readMessages).not.toHaveBeenCalled();
  });

  test("a failing receipt does not stop message handling", async () => {
    const client = await connectedClient();
    sock().readMessages.mockRejectedValueOnce(new Error("offline"));
    expect(await deliver(client, [incoming()])).toHaveLength(1);
  });
});

describe("sending", () => {
  test("sends text and returns the sent message", async () => {
    const client = await connectedClient();
    const sent = await client.sendMessage(GROUP, "hello group");
    expect(sock().sendMessage).toHaveBeenCalledWith(GROUP, { text: "hello group" }, { quoted: undefined });
    expect(sent).toMatchObject({ body: "hello group", fromMe: true, from: GROUP, author: BOT_LID });
  });

  test("returns undefined when nothing was sent", async () => {
    const client = await connectedClient();
    sock().sendMessage.mockResolvedValueOnce(undefined);
    expect(await client.sendMessage(GROUP, "x")).toBeUndefined();
  });

  const bytes = Buffer.from("data");
  const media = (mimetype: string, filename?: string) => new MessageMedia(mimetype, bytes.toString("base64"), filename);

  test.for([
    ["images", media("image/jpeg"), { image: bytes, caption: undefined, mimetype: "image/jpeg" }],
    ["videos", media("video/mp4"), { video: bytes, caption: undefined, mimetype: "video/mp4" }],
    ["audio", media("audio/ogg"), { audio: bytes, mimetype: "audio/ogg" }],
    [
      "documents",
      media("application/pdf", "Report (UniBot).pdf"),
      { document: bytes, mimetype: "application/pdf", fileName: "Report (UniBot).pdf", caption: undefined },
    ],
    [
      "unnamed documents",
      media("application/zip"),
      { document: bytes, mimetype: "application/zip", fileName: undefined, caption: undefined },
    ],
  ] as const)("sends %s by mimetype", async ([, content, expected]) => {
    const client = await connectedClient();
    await client.sendMessage(GROUP, content);
    expect(sock().sendMessage).toHaveBeenCalledWith(GROUP, expected, { quoted: undefined });
  });

  test("sends text with attached media as a caption", async () => {
    const client = await connectedClient();
    await client.sendMessage(GROUP, "caption text", { media: media("image/png") });
    expect(sock().sendMessage).toHaveBeenCalledWith(
      GROUP,
      { image: bytes, caption: "caption text", mimetype: "image/png" },
      { quoted: undefined },
    );
  });

  test("converts images to stickers with pack metadata", async () => {
    const client = await connectedClient();
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: "#ff0000" } })
      .png()
      .toBuffer();
    await client.sendMessage(GROUP, new MessageMedia("image/png", png.toString("base64")), {
      sendMediaAsSticker: true,
      stickerName: "Quote",
      stickerAuthor: "UniBot - YusifAliyevPro",
      stickerCategories: ["message"],
    });

    const content = sock().sendMessage.mock.calls[0][1] as { sticker: Buffer };
    const meta = await sharp(content.sticker).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });

    const image = new webp.Image();
    await image.load(content.sticker);
    const pack = JSON.parse(image.exif!.subarray(22).toString());
    expect(pack).toMatchObject({ "sticker-pack-name": "Quote", "sticker-pack-publisher": "UniBot - YusifAliyevPro", emojis: ["message"] });
    expect(pack["sticker-pack-id"]).toBeTypeOf("string");
  });

  test("replies quote the original message in its chat", async () => {
    const client = await connectedClient();
    const original = incoming({ jid: GROUP, participant: ALI_LID });
    const [msg] = await deliver(client, [original]);
    await msg.reply("answer");
    expect(sock().sendMessage).toHaveBeenLastCalledWith(GROUP, { text: "answer" }, { quoted: original });
  });

  test("replies can go to another chat", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming({ jid: GROUP, participant: ALI_LID })]);
    await msg.reply("psst", ALI_LID);
    expect(sock().sendMessage).toHaveBeenLastCalledWith(ALI_LID, { text: "psst" }, { quoted: msg._data });
  });

  test("reacts, forwards and pins", async () => {
    const client = await connectedClient();
    const original = incoming({ jid: GROUP, participant: ALI_LID });
    const [msg] = await deliver(client, [original]);

    await msg.react("✅");
    await msg.forward(ALI_LID);
    await msg.forward(await client.getChatById(GROUP));
    await msg.pin(86400);

    expect(sock().sendMessage.mock.calls).toEqual([
      [GROUP, { react: { text: "✅", key: original.key } }],
      [ALI_LID, { forward: original }],
      [GROUP, { forward: original }],
      [GROUP, { pin: original.key, type: proto.PinInChat.Type.PIN_FOR_ALL, time: 86400 }],
    ]);
  });

  test("typing and online presence", async () => {
    const client = await connectedClient();
    await (await client.getChatById(GROUP)).sendStateTyping();
    await client.sendPresenceAvailable();
    expect(sock().sendPresenceUpdate.mock.calls).toEqual([["composing", GROUP], ["available"]]);
  });
});

describe("chats", () => {
  test("group chats list members by LID with their roles", async () => {
    const client = await connectedClient();
    const chat = (await client.getChatById(GROUP)) as GroupChat;
    expect(chat).toBeInstanceOf(GroupChat);
    expect(chat).toMatchObject({ id: { _serialized: GROUP }, name: "UniChat", isGroup: true });
    expect(chat.participants).toEqual([
      { id: { _serialized: "111111111111111@lid" }, isAdmin: true, isSuperAdmin: true },
      { id: { _serialized: "222222222222222@lid" }, isAdmin: true, isSuperAdmin: false },
      { id: { _serialized: "333333333333333@lid" }, isAdmin: false, isSuperAdmin: false },
      { id: { _serialized: "444444444444444@lid" }, isAdmin: false, isSuperAdmin: false },
    ]);
  });

  test("group metadata is cached until the group changes", async () => {
    const client = await connectedClient();
    await client.getChatById(GROUP);
    await client.getChatById(GROUP);
    expect(sock().groupMetadata).toHaveBeenCalledOnce();

    await fire("groups.update", [{ id: GROUP, subject: "Renamed" }]);
    await client.getChatById(GROUP);
    await fire("group-participants.update", { id: GROUP, participants: [], action: "add" });
    await client.getChatById(GROUP);
    expect(sock().groupMetadata).toHaveBeenCalledTimes(3);
  });

  test("group members are resolved once until the group changes", async () => {
    const client = await connectedClient();
    await client.getChatById(GROUP);
    await client.getChatById(GROUP);
    expect(sock().signalRepository.lidMapping.getLIDForPN).toHaveBeenCalledOnce();

    await fire("group-participants.update", { id: GROUP, participants: [], action: "add" });
    await client.getChatById(GROUP);
    expect(sock().signalRepository.lidMapping.getLIDForPN).toHaveBeenCalledTimes(2);
  });

  test("private chats are named after the sender", async () => {
    const client = await connectedClient();
    await deliver(client, [incoming({ pushName: "Ali Aliyev" })]);
    expect(await client.getChatById(ALI_LID)).toMatchObject({ id: { _serialized: ALI_LID }, name: "Ali Aliyev", isGroup: false });
  });

  test("private chats by phone number use the LID", async () => {
    const client = await connectedClient();
    expect((await client.getChatById(ALI_PN)).id._serialized).toBe(ALI_LID);
  });

  test("unknown private chats fall back to the id", async () => {
    const client = await connectedClient();
    expect((await client.getChatById("555555555555555@lid")).name).toBe("555555555555555");
  });

  test("learns names from contact events", async () => {
    const client = await connectedClient();
    await fire("contacts.upsert", [
      { id: "700000000000001@lid", notify: "Notify", name: "Saved" },
      { id: "700000000000002@lid", name: "Saved Only" },
      { id: "700000000000003@lid", verifiedName: "Business" },
    ]);
    await fire("contacts.update", [{ id: "700000000000004@lid", notify: "Updated" }]);
    const names = await Promise.all(["1", "2", "3", "4"].map(async (n) => (await client.getChatById(`70000000000000${n}@lid`)).name));
    expect(names).toEqual(["Notify", "Saved Only", "Business", "Updated"]);
  });
});

const chatJid = (n: number) => `${800000000000000 + n}@lid`;

describe("message store", () => {
  test("keeps the last 20 messages of a chat in order", async () => {
    const client = await connectedClient();
    for (let i = 1; i <= 25; i++)
      await deliver(client, [incoming({ jid: GROUP, participant: ALI_LID, message: { conversation: `m${i}` } })]);
    const chat = await client.getChatById(GROUP);
    const all = await chat.fetchMessages();
    expect(all.map((m) => m.body)).toEqual(Array.from({ length: 20 }, (_, i) => `m${i + 6}`));
    expect((await chat.fetchMessages({ limit: 3 })).map((m) => m.body)).toEqual(["m23", "m24", "m25"]);
  });

  test("includes messages the bot sent", async () => {
    const client = await connectedClient();
    await deliver(client, [incoming({ jid: GROUP, participant: ALI_LID, message: { conversation: "question" } })]);
    await client.sendMessage(GROUP, "answer");
    const history = await (await client.getChatById(GROUP)).fetchMessages();
    expect(history.map((m) => [m.body, m.fromMe])).toEqual([
      ["question", false],
      ["answer", true],
    ]);
  });

  test("forgets the least recently active chats beyond 100", async () => {
    const client = await connectedClient();
    await deliver(client, [incoming({ jid: chatJid(0) })]);
    await deliver(client, [incoming({ jid: chatJid(1) })]);
    for (let n = 2; n < 100; n++) await deliver(client, [incoming({ jid: chatJid(n) })]);
    // 100 chats stored; chat 0 is touched again, so chat 1 becomes the oldest
    await deliver(client, [incoming({ jid: chatJid(0) })]);
    await deliver(client, [incoming({ jid: chatJid(100) })]);

    expect(client.storedMessages(chatJid(0))).toHaveLength(2);
    expect(client.storedMessages(chatJid(1))).toEqual([]);
    expect(client.storedMessages(chatJid(2))).toHaveLength(1);
    expect(client.storedMessages(chatJid(100))).toHaveLength(1);
  });

  test("serves stored messages for Baileys retries", async () => {
    const client = await connectedClient();
    await client.sendMessage(GROUP, "resend me");
    const { getMessage } = vi.mocked(makeWASocket).mock.calls[0][0];
    await expect(getMessage!({ remoteJid: GROUP, id: "SENT1" })).resolves.toEqual({ conversation: "resend me" });
    await expect(getMessage!({ remoteJid: GROUP, id: "UNKNOWN" })).resolves.toBeUndefined();
  });
});

/** A group message replying to `stanzaId` */
const quoting = (stanzaId: string, participant: string, quotedMessage: WAMessage["message"]) =>
  incoming({
    jid: GROUP,
    participant: ALI_LID,
    message: { extendedTextMessage: { text: "/s", contextInfo: { stanzaId, participant, quotedMessage } } },
  });

describe("quoted messages", () => {
  test("returns the full stored message when known", async () => {
    const client = await connectedClient();
    const original = incoming({
      jid: GROUP,
      participant: "222222222222222@lid",
      id: "ORIG",
      pushName: "Vali",
      message: { conversation: "original" },
    });
    await deliver(client, [original]);
    const [msg] = await deliver(client, [quoting("ORIG", "222222222222222@lid", { conversation: "original" })]);
    const quoted = await msg.getQuotedMessage();
    expect(quoted._data).toBe(original);
    expect((await quoted.getContact()).pushname).toBe("Vali");
  });

  test("rebuilds unknown quoted messages from the reply", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [quoting("OLD", ALI_PN, { imageMessage: { caption: "old pic" } })]);
    const quoted = await msg.getQuotedMessage();
    expect(quoted).toMatchObject({ body: "old pic", type: "image", from: GROUP, author: ALI_LID, fromMe: false, id: { id: "OLD" } });
  });

  test.for([BOT_LID, BOT_PN, "994500000001:7@s.whatsapp.net"])("recognises quotes of the bot's own messages (%s)", async (participant) => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [quoting("MINE", participant, { conversation: "bot said" })]);
    const quoted = await msg.getQuotedMessage();
    expect(quoted.fromMe).toBe(true);
    expect(quoted.author).toBe(BOT_LID);
  });

  test("throws when nothing is quoted", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming()]);
    await expect(msg.getQuotedMessage()).rejects.toThrow("Message has no quoted message");
  });
});

describe("contacts", () => {
  test("uses the push name of the message", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming({ jid: GROUP, participant: ALI_LID, pushName: "Ali" })]);
    expect(await msg.getContact()).toMatchObject({ id: { _serialized: ALI_LID }, pushname: "Ali" });
  });

  test("falls back to a learned name, then the number", async () => {
    const client = await connectedClient();
    await fire("contacts.upsert", [{ id: ALI_LID, notify: "Known Ali" }]);
    expect(client.getContactById(ALI_LID).pushname).toBe("Known Ali");
    expect(client.getContactById("994509999999@s.whatsapp.net").pushname).toBe("994509999999");
  });

  test("own messages belong to the bot", async () => {
    const client = await connectedClient();
    const sent = await client.sendMessage(ALI_LID, "hi");
    expect((await sent!.getContact()).id._serialized).toBe(BOT_LID);
  });

  test("profile pictures, or undefined when hidden", async () => {
    const client = await connectedClient();
    expect(await client.getContactById(ALI_LID).getProfilePicUrl()).toBe("https://pps.whatsapp.net/pic.jpg");
    sock().profilePictureUrl.mockRejectedValueOnce(new Error("not-authorized"));
    expect(await client.getContactById(ALI_LID).getProfilePicUrl()).toBeUndefined();
  });

  test("getLid passes through non phone ids without device suffixes", async () => {
    const client = await connectedClient();
    expect(await client.getLid("123456789012345:9@lid")).toBe("123456789012345@lid");
    expect(await client.getLid(GROUP)).toBe(GROUP);
    expect(sock().signalRepository.lidMapping.getLIDForPN).not.toHaveBeenCalled();
  });
});

describe("media download", () => {
  test("returns the file with its mimetype and name", async () => {
    const client = await connectedClient();
    const original = incoming({ message: { documentMessage: { mimetype: "application/msword", fileName: "essay.doc", fileLength: 4 } } });
    const [msg] = await deliver(client, [original]);
    vi.mocked(downloadMediaMessage).mockResolvedValueOnce(Buffer.from("word"));

    const media = await msg.downloadMedia();

    expect(media).toEqual(new MessageMedia("application/msword", Buffer.from("word").toString("base64"), "essay.doc", 4));
    expect(downloadMediaMessage).toHaveBeenCalledWith(
      original,
      "buffer",
      {},
      expect.objectContaining({ reuploadRequest: sock().updateMediaMessage }),
    );
  });

  test("propagates download failures", async () => {
    const client = await connectedClient();
    const [msg] = await deliver(client, [incoming({ message: { imageMessage: {} } })]);
    vi.mocked(downloadMediaMessage).mockRejectedValueOnce(new Error("expired"));
    await expect(msg.downloadMedia()).rejects.toThrow("expired");
  });
});
