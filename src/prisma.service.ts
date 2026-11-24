import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { db } from "./prisma/db.ts";
import { claimQuestion, createGameSession, endGameSession, findActiveSession, listActiveChatIds } from "./prisma/game-sessions.ts";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db = db;
  readonly findActiveSession = findActiveSession;
  readonly listActiveChatIds = listActiveChatIds;
  readonly createGameSession = createGameSession;
  readonly claimQuestion = claimQuestion;
  readonly endGameSession = endGameSession;

  async onModuleDestroy() {
    await this.db.close();
  }
}
