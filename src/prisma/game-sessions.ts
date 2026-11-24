import type { Scalars } from "@prisma/orm-postgres/family-contract/types";
import type { CreateInput } from "@prisma/orm-postgres/orm-client";
import type { Contract, Models } from "./contract.d.ts";
import { db } from "./db.ts";

export type GameSession = Scalars<Models.public_GameSession>;

const gameSessions = db.orm.public.GameSession;

export async function findActiveSession(chatId: string) {
  return await gameSessions.where({ chatId, isActive: true }).first();
}

export async function listActiveChatIds() {
  const rows = await gameSessions.where({ isActive: true }).select("chatId").all();
  return rows.map((row) => row.chatId);
}

export async function createGameSession(data: CreateInput<Contract, "GameSession">) {
  return await gameSessions.create(data);
}

/** Moves the game to the next question unless another message already did; the first caller wins */
export async function claimQuestion(session: GameSession, isCorrect: boolean) {
  // Pinning lastQuestion in the filter makes these absolute values as safe as an increment
  const count = await gameSessions.where({ id: session.id, isActive: true, lastQuestion: session.lastQuestion }).updateAndCount({
    lastQuestion: session.lastQuestion + 1,
    ...(isCorrect && { numberOfCorrectAnswers: session.numberOfCorrectAnswers + 1 }),
  });
  return count > 0;
}

/** Ends the game unless another message already moved it past `lastQuestion` */
export async function endGameSession(id: string, lastQuestion: number) {
  const count = await gameSessions.where({ id, isActive: true, lastQuestion }).updateAndCount({ isActive: false });
  return count > 0;
}
