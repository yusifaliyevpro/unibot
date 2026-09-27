import { vi } from "vitest";
import type { GameSession } from "../src/generated/prisma/client.ts";
import type { Chat, Contact, GroupChat, GroupParticipant, Message, MessageMedia, MessageTypes } from "../src/lib/whatsapp.ts";

// Lightweight stand-ins for wrapper objects, used by handler/service tests. The wrapper itself is tested against a fake socket.

let idCounter = 0;

type FakeChatInit = {
  id?: string;
  name?: string;
  isGroup?: boolean;
  participants?: GroupParticipant[];
  history?: Message[];
};

export function fakeChat(init: FakeChatInit = {}) {
  const isGroup = init.isGroup ?? false;
  const chat = {
    id: { _serialized: init.id ?? (isGroup ? "120363000000000000@g.us" : "100000000000001@lid") },
    name: init.name ?? (isGroup ? "Test Group" : "Test User"),
    isGroup,
    participants: init.participants ?? [],
    sendMessage: vi.fn(async (content: string | MessageMedia, _options?: object): Promise<Message> =>
      fakeMessage({ body: typeof content === "string" ? content : "", fromMe: true }),
    ),
    sendStateTyping: vi.fn(async () => {}),
    fetchMessages: vi.fn(async (_options?: { limit?: number }) => init.history ?? []),
  };
  return chat as typeof chat & GroupChat & Chat;
}

export type FakeChat = ReturnType<typeof fakeChat>;

type FakeMessageInit = {
  id?: string;
  body?: string;
  from?: string;
  author?: string;
  fromMe?: boolean;
  type?: MessageTypes;
  hasMedia?: boolean;
  size?: number;
  mentionedIds?: string[];
  quoted?: Message;
  chat?: FakeChat;
  pushname?: string;
  profilePicUrl?: string;
  media?: MessageMedia;
};

export function fakeMessage(init: FakeMessageInit = {}) {
  const id = init.id ?? `MSG${++idCounter}`;
  const from = init.from ?? "100000000000001@lid";
  const contact: Contact = {
    id: { _serialized: init.author ?? from },
    pushname: init.pushname ?? "Test User",
    getProfilePicUrl: vi.fn(async () => init.profilePicUrl),
  };
  const msg = {
    id: { _serialized: id, id, fromMe: init.fromMe ?? false, remote: from },
    body: init.body ?? "",
    from,
    author: init.author,
    fromMe: init.fromMe ?? false,
    type: init.type ?? "chat",
    hasMedia: init.hasMedia ?? false,
    hasQuotedMsg: !!init.quoted,
    size: init.size ?? 0,
    mentionedIds: init.mentionedIds ?? [],
    reply: vi.fn(async (content: string | MessageMedia, _chatId?: string, _options?: object): Promise<Message> =>
      fakeMessage({ body: typeof content === "string" ? content : "", fromMe: true }),
    ),
    react: vi.fn(async (_emoji: string) => {}),
    forward: vi.fn(async () => {}),
    pin: vi.fn(async () => {}),
    getChat: vi.fn(async (): Promise<Chat> => init.chat ?? fakeChat({ id: from })),
    getContact: vi.fn(async () => contact),
    getQuotedMessage: vi.fn(async (): Promise<Message> => {
      if (!init.quoted) throw new Error("Message has no quoted message");
      return init.quoted;
    }),
    downloadMedia: vi.fn(async () => {
      if (!init.media) throw new Error("No media");
      return init.media;
    }),
  };
  return msg as typeof msg & Message;
}

export type FakeMessage = ReturnType<typeof fakeMessage>;

const matches = (session: GameSession, where: Partial<GameSession> = {}) =>
  Object.entries(where).every(([key, value]) => session[key as keyof GameSession] === value);

/** Applies a Prisma `data` object, including `{ increment }` updates */
function apply(session: GameSession, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    const field = key as keyof GameSession;
    if (value && typeof value === "object" && "increment" in value) {
      (session[field] as number) += (value as { increment: number }).increment;
    } else {
      (session as Record<string, unknown>)[field] = value;
    }
  }
}

/** In-memory stand-in for the `gameSession` Prisma delegate (only the calls GameService makes) */
export function fakePrisma() {
  const sessions: GameSession[] = [];

  const gameSession = {
    // Copies, like real Prisma rows: later updates must not change rows the caller already holds
    findFirst: vi.fn(async ({ where }: { where: Partial<GameSession> }) => {
      const session = sessions.find((s) => matches(s, where));
      return session ? { ...session } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: Partial<GameSession> }) => sessions.filter((s) => matches(s, where)).map((s) => ({ ...s }))),
    create: vi.fn(async ({ data }: { data: Omit<GameSession, "id" | "numberOfCorrectAnswers"> }) => {
      const session: GameSession = { id: `session-${sessions.length + 1}`, numberOfCorrectAnswers: 0, ...data };
      sessions.push(session);
      return { ...session };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const session = sessions.find((s) => s.id === where.id);
      if (!session) throw new Error(`No session ${where.id}`);
      apply(session, data);
      return { ...session };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Partial<GameSession>; data: Record<string, unknown> }) => {
      const matched = sessions.filter((s) => matches(s, where));
      for (const session of matched) apply(session, data);
      return { count: matched.length };
    }),
  };
  return { sessions, gameSession };
}
