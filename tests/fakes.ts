import { vi } from "vitest";
import type { Chat, Contact, GroupChat, GroupParticipant, Message, MessageMedia, MessageTypes } from "../src/lib/whatsapp.ts";
import type { GameSession } from "../src/prisma/game-sessions.ts";

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

/** In-memory stand-in for the query helpers `PrismaService` exposes; rows are copies, like real query results */
export function fakePrisma() {
  const sessions: GameSession[] = [];

  const claim = (where: Partial<GameSession>, data: Partial<GameSession>) => {
    const matched = sessions.filter((s) => matches(s, where));
    for (const session of matched) Object.assign(session, data);
    return matched.length > 0;
  };

  return {
    sessions,
    findActiveSession: vi.fn(async (chatId: string) => {
      const session = sessions.find((s) => matches(s, { chatId, isActive: true }));
      return session ? { ...session } : null;
    }),
    listActiveChatIds: vi.fn(async () => sessions.filter((s) => s.isActive).map((s) => s.chatId)),
    createGameSession: vi.fn(async (data: Omit<GameSession, "id" | "numberOfCorrectAnswers">) => {
      const session: GameSession = { id: `session-${sessions.length + 1}`, numberOfCorrectAnswers: 0, ...data };
      sessions.push(session);
      return { ...session };
    }),
    claimQuestion: vi.fn(async (session: GameSession, isCorrect: boolean) =>
      claim(
        { id: session.id, isActive: true, lastQuestion: session.lastQuestion },
        {
          lastQuestion: session.lastQuestion + 1,
          ...(isCorrect && { numberOfCorrectAnswers: session.numberOfCorrectAnswers + 1 }),
        },
      ),
    ),
    endGameSession: vi.fn(async (id: string, lastQuestion: number) => claim({ id, isActive: true, lastQuestion }, { isActive: false })),
  };
}
