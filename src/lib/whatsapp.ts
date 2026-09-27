import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import {
  type AnyMessageContent,
  areJidsSameUser,
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
  type GroupMetadata,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  makeWASocket,
  jidNormalizedUser,
  normalizeMessageContent,
  proto,
  toNumber,
  useMultiFileAuthState,
  type WAMessage,
  type WAMessageContent,
  type WASocket,
} from "baileys";
import webp from "node-webpmux";
import pino from "pino";
import sharp from "sharp";

// Thin whatsapp-web.js style wrapper over Baileys. Users are identified by their LID ("@lid"), the phone number jid is only a fallback

const logger = pino({ level: "error" });

// libsignal logs routine session rotation via console (including private keys), drop those lines
const LIBSIGNAL_NOISE = [
  "Closing session",
  "Opening session",
  "Removing old closed session",
  "Session already",
  "Closing open session",
  "Migrating session",
];
for (const method of ["info", "warn"] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (typeof args[0] === "string" && LIBSIGNAL_NOISE.some((noise) => (args[0] as string).startsWith(noise))) return;
    original(...args);
  };
}
// In-memory caps so long uptimes don't grow RAM; least recently active chats/names are evicted first
const STORE_LIMIT = 20;
const MAX_CHATS = 100;
const MAX_NAMES = 2000;
const MAX_RECONNECT_DELAY = 60_000;

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value!);
}

export const MessageTypes = {
  TEXT: "chat",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  VOICE: "ptt",
  DOCUMENT: "document",
  STICKER: "sticker",
  UNKNOWN: "unknown",
} as const;
export type MessageTypes = (typeof MessageTypes)[keyof typeof MessageTypes];

export type MessageSendOptions = {
  /** no-op: Baileys doesn't generate link previews without link-preview-js */
  linkPreview?: boolean;
  caption?: string;
  media?: MessageMedia;
  sendMediaAsSticker?: boolean;
  stickerAuthor?: string;
  stickerName?: string;
  stickerCategories?: string[];
  quoted?: WAMessage;
};

export class LocalAuth {
  constructor(public readonly dataPath = ".baileys_auth") {}
}

export class MessageMedia {
  constructor(
    public mimetype: string,
    public data: string,
    public filename?: string | null,
    public filesize?: number | null,
  ) {}

  static async fromUrl(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch media: ${response.status} ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimetype = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    return new MessageMedia(mimetype, buffer.toString("base64"), new URL(url).pathname.split("/").pop(), buffer.length);
  }
}

export type Contact = {
  id: { _serialized: string };
  pushname: string;
  getProfilePicUrl: () => Promise<string | undefined>;
};

export type GroupParticipant = { id: { _serialized: string }; isAdmin: boolean; isSuperAdmin: boolean };

export class Chat {
  id: { _serialized: string };
  isGroup = false;

  constructor(
    protected client: Client,
    id: string,
    public name: string,
  ) {
    this.id = { _serialized: id };
  }

  private get jid() {
    return this.id._serialized;
  }

  async sendMessage(content: string | MessageMedia, options?: MessageSendOptions) {
    return await this.client.sendMessage(this.jid, content, options);
  }

  async sendStateTyping() {
    await this.client.sock.sendPresenceUpdate("composing", this.jid);
  }

  async fetchMessages({ limit = STORE_LIMIT }: { limit?: number } = {}) {
    return await Promise.all(
      this.client
        .storedMessages(this.jid)
        .slice(-limit)
        .map((m) => this.client.createMessage(m)),
    );
  }
}

export class GroupChat extends Chat {
  override isGroup = true;

  constructor(
    client: Client,
    jid: string,
    name: string,
    public participants: GroupParticipant[],
  ) {
    super(client, jid, name);
  }
}

export class Message {
  id: { _serialized: string; id: string; fromMe: boolean; remote: string };
  body: string;
  type: MessageTypes;
  hasMedia: boolean;
  hasQuotedMsg: boolean;
  /** media size in bytes */
  size: number;

  constructor(
    private client: Client,
    readonly _data: WAMessage,
    /** chat id for groups, sender id for private chats */
    public from: string,
    /** sender id in groups */
    public author: string | undefined,
    public mentionedIds: string[],
  ) {
    const { key } = _data;
    const content = normalizeMessageContent(_data.message);
    const contentType = getContentType(content);
    const inner = contentType
      ? (content?.[contentType] as { caption?: string; fileLength?: Parameters<typeof toNumber>[0]; contextInfo?: proto.IContextInfo })
      : undefined;

    this.id = { _serialized: key.id ?? "", id: key.id ?? "", fromMe: !!key.fromMe, remote: from };
    this.type = getMessageType(content);
    this.body = content?.conversation || content?.extendedTextMessage?.text || inner?.caption || "";
    this.hasMedia = !([MessageTypes.TEXT, MessageTypes.UNKNOWN] as MessageTypes[]).includes(this.type);
    this.hasQuotedMsg = !!inner?.contextInfo?.quotedMessage;
    this.size = toNumber(inner?.fileLength);
  }

  get fromMe() {
    return !!this._data.key.fromMe;
  }

  private get chatJid() {
    return this._data.key.remoteJid!;
  }

  private get contextInfo() {
    const content = normalizeMessageContent(this._data.message);
    const contentType = getContentType(content);
    return contentType ? (content?.[contentType] as { contextInfo?: proto.IContextInfo })?.contextInfo : undefined;
  }

  async reply(content: string | MessageMedia, chatId?: string, options?: MessageSendOptions) {
    return await this.client.sendMessage(chatId ?? this.chatJid, content, { ...options, quoted: this._data });
  }

  async react(emoji: string) {
    await this.client.sock.sendMessage(this.chatJid, { react: { text: emoji, key: this._data.key } });
  }

  async forward(chat: Chat | string) {
    const jid = typeof chat === "string" ? chat : chat.id._serialized;
    await this.client.sock.sendMessage(jid, { forward: this._data });
  }

  async pin(duration: 86400 | 604800 | 2592000) {
    await this.client.sock.sendMessage(this.chatJid, { pin: this._data.key, type: proto.PinInChat.Type.PIN_FOR_ALL, time: duration });
  }

  async getChat() {
    return await this.client.getChatById(this.chatJid);
  }

  async getContact(): Promise<Contact> {
    const id = this.author ?? (this.fromMe ? this.client.info.wid._serialized : this.from);
    return this.client.getContactById(id, this._data.pushName);
  }

  async getQuotedMessage() {
    const ctx = this.contextInfo;
    if (!ctx?.quotedMessage || !ctx.stanzaId) throw new Error("Message has no quoted message");
    const stored = this.client.storedMessages(this.chatJid).find((m) => m.key.id === ctx.stanzaId);
    if (stored) return await this.client.createMessage(stored);

    const participant = ctx.participant ?? undefined;
    return await this.client.createMessage({
      key: {
        remoteJid: this.chatJid,
        id: ctx.stanzaId,
        fromMe: this.client.isMe(participant),
        participant: isJidGroup(this.chatJid) ? participant : undefined,
      },
      message: ctx.quotedMessage,
    });
  }

  async downloadMedia() {
    const content = normalizeMessageContent(this._data.message);
    const contentType = getContentType(content);
    const media = (contentType ? content?.[contentType] : undefined) as { mimetype?: string; fileName?: string } | undefined;
    const buffer = await downloadMediaMessage(this._data, "buffer", {}, { logger, reuploadRequest: this.client.sock.updateMediaMessage });
    return new MessageMedia(media?.mimetype ?? "application/octet-stream", buffer.toString("base64"), media?.fileName, buffer.length);
  }
}

function getMessageType(content: WAMessageContent | undefined): MessageTypes {
  switch (getContentType(content)) {
    case "conversation":
    case "extendedTextMessage":
      return MessageTypes.TEXT;
    case "imageMessage":
      return MessageTypes.IMAGE;
    case "videoMessage":
      return MessageTypes.VIDEO;
    case "audioMessage":
      return content?.audioMessage?.ptt ? MessageTypes.VOICE : MessageTypes.AUDIO;
    case "documentMessage":
      return MessageTypes.DOCUMENT;
    case "stickerMessage":
      return MessageTypes.STICKER;
    default:
      return MessageTypes.UNKNOWN;
  }
}

async function toStickerWebp(buffer: Buffer, options: MessageSendOptions) {
  const sticker = await sharp(buffer)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp()
    .toBuffer();

  // WhatsApp reads sticker pack metadata from a custom EXIF tag (0x5741) holding JSON
  const json = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": randomUUID(),
      "sticker-pack-name": options.stickerName,
      "sticker-pack-publisher": options.stickerAuthor,
      emojis: options.stickerCategories ?? [""],
    }),
  );
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const exif = Buffer.concat([exifAttr, json]);
  exif.writeUIntLE(json.length, 14, 4);

  const image = new webp.Image();
  await image.load(sticker);
  image.exif = exif;
  return await image.save(null);
}

async function toMessageContent(content: string | MessageMedia, options: MessageSendOptions): Promise<AnyMessageContent> {
  const media = content instanceof MessageMedia ? content : options.media;
  const caption = typeof content === "string" ? content : options.caption;
  if (!media) return { text: caption ?? "" };

  const buffer = Buffer.from(media.data, "base64");
  const { mimetype } = media;
  if (options.sendMediaAsSticker) return { sticker: await toStickerWebp(buffer, options) };
  if (mimetype.startsWith("image/")) return { image: buffer, caption, mimetype };
  if (mimetype.startsWith("video/")) return { video: buffer, caption, mimetype };
  if (mimetype.startsWith("audio/")) return { audio: buffer, mimetype };
  return { document: buffer, mimetype, fileName: media.filename ?? undefined, caption };
}

type ClientEvents = {
  qr: [qr: string];
  authenticated: [];
  auth_failure: [message: string];
  ready: [];
  message: [message: Message];
  disconnected: [reason: string];
};

export class Client extends EventEmitter<ClientEvents> {
  sock!: WASocket;
  info!: { wid: { _serialized: string }; pushname: string };

  private isReady = false;
  private messages = new Map<string, WAMessage[]>();
  private names = new Map<string, string>();
  /** unix seconds of the last connection open, older (offline) messages are ignored */
  private onlineSince = 0;
  private groupCache = new Map<string, GroupMetadata>();
  /** Members by LID, resolving them can mean a LID lookup per member */
  private participantsCache = new Map<string, GroupParticipant[]>();
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private options: { authStrategy?: LocalAuth } = {}) {
    super();
  }

  private get authPath() {
    return (this.options.authStrategy ?? new LocalAuth()).dataPath;
  }

  async initialize() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const sock = makeWASocket({
      auth: state,
      logger,
      markOnlineOnConnect: true,
      shouldSyncHistoryMessage: () => false,
      getMessage: async (key) => this.storedMessages(key.remoteJid!).find((m) => m.key.id === key.id)?.message ?? undefined,
      cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) this.emit("qr", qr);

      if (connection === "open") {
        this.reconnectAttempts = 0;
        this.onlineSince = Math.floor(Date.now() / 1000);
        this.info = { wid: { _serialized: jidNormalizedUser(sock.user!.lid ?? sock.user!.id) }, pushname: sock.user?.name ?? "" };
        this.emit("authenticated");
        if (!this.isReady) {
          this.isReady = true;
          this.emit("ready");
        }
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
          this.isReady = false;
          await rm(this.authPath, { recursive: true, force: true });
          if (statusCode === DisconnectReason.badSession) this.emit("auth_failure", "Bad session");
          this.emit("disconnected", statusCode === DisconnectReason.loggedOut ? "LOGOUT" : "BAD_SESSION");
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          // Reconnecting would kick the other session, which then kicks this one, forever
          logger.error("Connection replaced by another session, not reconnecting");
        } else if (statusCode === DisconnectReason.restartRequired) {
          // Expected right after the QR scan
          await this.reconnect();
        } else {
          this.scheduleReconnect();
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // Blue ticks for every live incoming message, whether or not the bot handles it
      const toRead = messages.filter(
        ({ key, message, messageTimestamp }) =>
          type === "notify" &&
          !key.fromMe &&
          !!message &&
          !!key.remoteJid &&
          !isJidStatusBroadcast(key.remoteJid) &&
          !isJidNewsletter(key.remoteJid) &&
          toNumber(messageTimestamp) >= this.onlineSince,
      );
      if (toRead.length)
        void sock.readMessages(toRead.map((m) => m.key)).catch((error) => logger.error(error, "Failed to send read receipts"));

      for (const waMsg of messages) {
        const { key } = waMsg;
        const jid = key.remoteJid;
        if (!jid || isJidStatusBroadcast(jid) || isJidNewsletter(jid)) continue;
        // Offline backlog delivered on (re)connect
        if (toNumber(waMsg.messageTimestamp) < this.onlineSince) continue;
        // Undecryptable stubs, reactions, edits, protocol/system messages. Not stored, so a later decrypted retry isn't treated as a duplicate
        if (waMsg.message?.editedMessage || getMessageType(normalizeMessageContent(waMsg.message)) === MessageTypes.UNKNOWN) continue;
        // Re-deliveries reuse the same id
        if (this.storedMessages(jid).some((m) => m.key.id === key.id)) continue;

        this.storeMessage(waMsg);
        if (waMsg.pushName && !key.fromMe) this.setName([key.participant ?? jid, key.participantAlt ?? key.remoteJidAlt], waMsg.pushName);

        // Own messages (sent by this socket or the phone) also arrive here
        if (type !== "notify" || key.fromMe) continue;

        try {
          this.emit("message", await this.createMessage(waMsg));
        } catch (error) {
          logger.error(error, "Failed to handle incoming message");
        }
      }
    });

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) {
        const name = c.notify || c.name || c.verifiedName;
        if (name) this.setName([c.id, c.lid, c.phoneNumber], name);
      }
    });
    sock.ev.on("contacts.update", (contacts) => {
      for (const c of contacts) {
        const name = c.notify || c.name || c.verifiedName;
        if (name && c.id) this.setName([c.id, c.lid, c.phoneNumber], name);
      }
    });

    sock.ev.on("groups.update", (updates) => {
      for (const u of updates) if (u.id) this.forgetGroup(u.id);
    });
    sock.ev.on("group-participants.update", ({ id }) => this.forgetGroup(id));
  }

  /** Fresh socket, retried later if even that fails */
  private async reconnect() {
    try {
      await this.initialize();
    } catch (error) {
      logger.error(error, "Failed to reconnect");
      this.scheduleReconnect();
    }
  }

  /** Waits 1s, 2s, 4s... up to a minute between attempts, so an outage isn't a tight reconnect loop */
  private scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts++, MAX_RECONNECT_DELAY);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => void this.reconnect(), delay);
  }

  private forgetGroup(jid: string) {
    this.groupCache.delete(jid);
    this.participantsCache.delete(jid);
  }

  async sendMessage(chatId: string, content: string | MessageMedia, options: MessageSendOptions = {}) {
    const sent = await this.sock.sendMessage(chatId, await toMessageContent(content, options), { quoted: options.quoted });
    if (!sent) return undefined;
    this.storeMessage(sent);
    return await this.createMessage(sent);
  }

  async sendPresenceAvailable() {
    await this.sock.sendPresenceUpdate("available");
  }

  async getChatById(jid: string): Promise<Chat> {
    if (isJidGroup(jid)) {
      const metadata = await this.groupMetadata(jid);
      let participants = this.participantsCache.get(jid);
      if (!participants) {
        participants = await Promise.all(
          metadata.participants.map(async (p) => ({
            id: { _serialized: await this.resolveId(p.id, p.lid) },
            isAdmin: !!p.admin,
            isSuperAdmin: p.admin === "superadmin",
          })),
        );
        this.participantsCache.set(jid, participants);
      }
      return new GroupChat(this, jid, metadata.subject, participants);
    }

    const id = await this.resolveId(jid);
    return new Chat(this, id, this.names.get(id) ?? this.names.get(jidNormalizedUser(jid)) ?? id.split("@")[0]);
  }

  /** User id (LID) of a jid, e.g. a phone number from .env. PN -> LID is fetched from WhatsApp when unknown */
  async getLid(jid: string) {
    if (!isPnUser(jid)) return jidNormalizedUser(jid);
    const lid = await this.sock.signalRepository.lidMapping.getLIDForPN(jid).catch(() => null);
    return jidNormalizedUser(lid ?? jid);
  }

  getContactById(jid: string, pushName?: string | null): Contact {
    return {
      id: { _serialized: jid },
      // Last resort is the id's user part (LID digits, rarely a phone number)
      pushname: pushName || this.names.get(jidNormalizedUser(jid)) || jid.split("@")[0],
      getProfilePicUrl: async () => await this.sock.profilePictureUrl(jid, "image").catch(() => undefined),
    };
  }

  /** @internal */
  async createMessage(waMsg: WAMessage) {
    const { key } = waMsg;
    const jid = key.remoteJid!;
    const isGroup = isJidGroup(jid);

    const content = normalizeMessageContent(waMsg.message);
    const contentType = getContentType(content);
    const contextInfo = contentType ? (content?.[contentType] as { contextInfo?: proto.IContextInfo })?.contextInfo : undefined;
    const mentionedIds = await Promise.all((contextInfo?.mentionedJid ?? []).map((m) => this.resolveId(m)));

    let from: string;
    let author: string | undefined;
    if (isGroup) {
      from = jid;
      author = key.fromMe ? this.info.wid._serialized : await this.resolveId(key.participant ?? "", key.participantAlt);
    } else {
      from = key.fromMe ? this.info.wid._serialized : await this.resolveId(jid, key.remoteJidAlt);
    }

    return new Message(this, waMsg, from, author, mentionedIds);
  }

  /** @internal */
  isMe(jid?: string | null) {
    if (!jid) return false;
    return areJidsSameUser(jid, this.sock.user?.id) || areJidsSameUser(jid, this.sock.user?.lid);
  }

  /** @internal */
  storedMessages(jid: string) {
    return this.messages.get(jidNormalizedUser(jid)) ?? [];
  }

  /** LID of a user jid (`alt` is the other addressing form WhatsApp sent along, if any) */
  private async resolveId(jid: string, alt?: string | null) {
    if (isLidUser(jid)) return jidNormalizedUser(jid);
    if (alt && isLidUser(alt)) return jidNormalizedUser(alt);
    return await this.getLid(jid);
  }

  private async groupMetadata(jid: string) {
    let metadata = this.groupCache.get(jid);
    if (!metadata) {
      metadata = await this.sock.groupMetadata(jid);
      this.groupCache.set(jid, metadata);
    }
    return metadata;
  }

  private storeMessage(waMsg: WAMessage) {
    const { remoteJid, remoteJidAlt } = waMsg.key;
    for (const jid of new Set([remoteJid, remoteJidAlt].filter(Boolean).map((j) => jidNormalizedUser(j!)))) {
      const list = this.messages.get(jid) ?? [];
      if (list.some((m) => m.key.id === waMsg.key.id)) continue;
      list.push(waMsg);
      if (list.length > STORE_LIMIT) list.shift();
      setBounded(this.messages, jid, list, MAX_CHATS);
    }
  }

  private setName(jids: (string | null | undefined)[], name: string) {
    for (const jid of jids) if (jid) setBounded(this.names, jidNormalizedUser(jid), name, MAX_NAMES);
  }
}
