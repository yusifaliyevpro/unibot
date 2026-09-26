import { Injectable } from "@nestjs/common";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { gamePackages } from "../../3sual.js";
import type { GameSession, Prisma } from "../../generated/prisma/client.ts";
import { ENV } from "../../lib/env.js";
import { sendErrorLog, sendLog } from "../../lib/logger.ts";
import { gameMsgs, LogMessages } from "../../lib/logger_messages.ts";
import { getCommand } from "../../lib/utils.js";
import { type Chat, type GroupChat, type Message, MessageMedia } from "../../lib/whatsapp.ts";
import client from "../../modules/bot/client.js";
import { PrismaService } from "../../prisma.service.ts";

@Injectable()
export class GameService {
  constructor(private prisma: PrismaService) {}

  async handleGame(msg: Message, chat: Chat, isAdmin: boolean) {
    try {
      const { isQuit, isRight, isPass } = getCommand(msg.body.trim().toLowerCase());
      const sendStateTyping = async () => await chat.sendStateTyping();

      const session = await this.GameSession({ isActive: true, phoneNumber: msg.from });
      if (!session) return;
      const gamePackage = gamePackages[session.packageIndex];
      const questionCount = gamePackage.questions.length;
      const isLastQuestion = questionCount === session.lastQuestion + 1;
      const question = gamePackage.questions[session.lastQuestion];
      const sendAnswer = async (to: Message = msg) => await to.reply(this.answerText(question), undefined, { linkPreview: false });

      // Moves on to the next question, or finishes the game after the last one
      const advance = async (isCorrect: boolean) => {
        await this.UpdateLastQuestion(session.id);
        if (isCorrect) await this.markAsCorrect(session.id);
        if (isLastQuestion) return await this.quitGame(chat, msg, session.id, questionCount);
        await sendStateTyping();
        await this.sendQuestion(chat, gamePackage.questions[session.lastQuestion + 1], session.lastQuestion + 2);
      };

      if (isAdmin && msg.hasQuotedMsg && isRight) {
        const quotedMsg = await msg.getQuotedMessage();
        await quotedMsg.react("✅");
        await sendAnswer(quotedMsg);
        await advance(true);
      } else if (isQuit) {
        await sendStateTyping();
        if (chat.isGroup && !isAdmin) return await msg.reply(gameMsgs.ONLY_ADMINS_CAN_QUIT);
        await sendAnswer();
        await this.quitGame(chat, msg, session.id, questionCount);
      } else if (isPass) {
        await sendStateTyping();
        await sendAnswer();
        await advance(false);
      } else {
        await msg.react("⏳");
        // Azerbaijani casing, so "BAKI" matches "Bakı"
        const answer = msg.body.toLocaleLowerCase("az");
        const matches = (expected: string | null) => !!expected && answer.includes(expected.toLocaleLowerCase("az"));
        if (
          matches(question.answer) ||
          matches(question.considered) ||
          (await this.verifyAnswerByAI(question.answer, question.considered, msg.body))
        ) {
          await sendStateTyping();
          await msg.react("✅");
          await sendAnswer();
          await advance(true);
        } else {
          await msg.react("❌");
        }
      }
    } catch (error) {
      await sendErrorLog(LogMessages.GAME_HANDLER, msg, error);
    }
  }

  async handleGameStart(msg: Message, chat: Chat) {
    try {
      const bodyParts = msg.body.trim().toLowerCase().split(/\s+/);
      let gamePackageIndex: number;

      if (bodyParts.length === 1) {
        gamePackageIndex = Math.floor(Math.random() * gamePackages.length);
      } else if (bodyParts.length === 2 && !isNaN(Number(bodyParts[1]))) {
        gamePackageIndex = gamePackages.findIndex((gp) => gp.id === Number(bodyParts[1]));
        if (gamePackageIndex === -1)
          return await chat.sendMessage(
            "Paket tapılmadı! Zəhmət olmasa Paket ID-sini düzgün daxil etdiyinizə əmin olun. Paket yenidirsə, bazaya əlavə edilməmiş ola bilər.",
          );
      } else {
        return await chat.sendMessage(
          "Əmr səhvdir! Zəhmət olmasa şablona uyğun yazın:\n1. Random Paket: /start \n2. Spesifik Paket: /start [packageID]",
        );
      }

      const gamePackage = gamePackages[gamePackageIndex];
      const session = await this.createGameSession({
        lastQuestion: 0,
        packageID: gamePackage.id,
        phoneNumber: msg.from,
        packageIndex: gamePackageIndex,
        isActive: true,
      });
      await msg.reply(gameMsgs.START);

      await chat.sendMessage(
        `Siz *${gamePackage.id}* nömrəli, ${gamePackage.name ? `"${gamePackage.name}" adlı` : "adsız"} paketi oynayırsınız.\n\n` +
          `Bu Paket *${gamePackage.questions.length}* sualdan ibarətdir.\n` +
          `${gamePackage.editors.length ? `*Redaktor${gamePackage.editors.length > 1 ? "lar" : ""}*: ${gamePackage.editors.join(", ")}\n` : ""}` +
          `Paket linki: https://3sual.az/package/${gamePackage.id}`,
        { linkPreview: false },
      );

      await this.sendQuestion(chat, gamePackage.questions[session.lastQuestion], session.lastQuestion + 1);

      await msg.react("🏓");

      if (chat.isGroup) {
        const superAdmin = (chat as GroupChat).participants.find((p) => p.isSuperAdmin)?.id._serialized;
        if (superAdmin) await client.sendMessage(superAdmin, gamePackage.questions.map((gp, i) => `${i + 1}. ${gp.answer}`).join("\n"));
      }

      await sendLog(LogMessages.NEW_GAME, msg);
    } catch (error) {
      await sendErrorLog(LogMessages.NEW_GAME, msg, error);
    }
  }

  private async quitGame(chat: Chat, msg: Message, sessionId: string, questionCount: number) {
    const session = await this.prisma.gameSession.update({ data: { isActive: false }, where: { id: sessionId } });

    await chat.sendMessage(
      `🧾 Paketdəki sualların sayı: ${questionCount}
📈 Oynanılan sual sayı: ${Math.min(session.lastQuestion + 1, questionCount)}
✅ Doğru cavabların sayı: ${session.numberOfCorrectAnswers}`,
    );
    await msg.reply(gameMsgs.FINISHED);
  }

  private async sendQuestion(chat: Chat, question: Question, number: number) {
    let questionText = `${number}. ${question.question.trim()}`;
    const { rekvizit } = question;
    if (rekvizit?.text) questionText = `_*Rekvizit:*_ ${rekvizit.rekvizit.trim()}\n\n${questionText}`;
    else if (rekvizit) await chat.sendMessage(await MessageMedia.fromUrl(`https://api.3sual.az/images/${rekvizit.rekvizit}`));
    await chat.sendMessage(questionText, { linkPreview: false });
  }

  private answerText(question: Question) {
    const { authors } = question;
    return (
      `*Cavab: ${question.answer.trim()}*\n\n` +
      `*Müəllif${authors.length > 1 ? "lər" : ""}:* ${authors.length ? authors.join(", ") : "Yoxdur"}\n\n` +
      `${question.considered ? `*Meyar:* ${question.considered.trim()}\n\n` : ""}` +
      `*Şərh:* ${question.comment?.trim() || "*Yoxdur*"}`
    );
  }

  private async GameSession(GameSessionWhereUniqueInput: Prisma.GameSessionWhereInput): Promise<GameSession | null> {
    return await this.prisma.gameSession.findFirst({
      where: GameSessionWhereUniqueInput,
    });
  }

  async hasActiveSession(phoneNumber: string): Promise<boolean> {
    return !!(await this.prisma.gameSession.findMany({ where: { phoneNumber, isActive: true } })).length;
  }
  private async createGameSession(data: Prisma.GameSessionCreateInput): Promise<GameSession> {
    return await this.prisma.gameSession.create({
      data,
    });
  }

  private async UpdateLastQuestion(id: string) {
    await this.prisma.gameSession.update({ data: { lastQuestion: { increment: 1 } }, where: { id } });
  }

  private async markAsCorrect(id: string) {
    await this.prisma.gameSession.update({ where: { id }, data: { numberOfCorrectAnswers: { increment: 1 } } });
  }

  private async verifyAnswerByAI(answer: string, considered: string | null, userAnswer: string) {
    try {
      const { output } = await generateText({
        model: openrouter.chat("deepseek/deepseek-v4-flash"),
        output: Output.object({ schema: answerVerificationSchema }),
        prompt: `Sən çox dəqiq çalışan yoxlayıcı bir oyun süni intellektisən.
İstifadəçinin cavabının düzgün olub-olmadığını aşağıdakı "doğru cavab"a əsaslanaraq qiymətləndir.
Kiçik yazı səhvlərinə, fərqli yazılışlara, sinonimlərə və eyni mənanı verən ifadələrə icazə ver.
          
${considered ? "Sayılma meyarı isə cavabın yazıla biləcəyi 2-ci variantdır, əgər əsas cavabla uyğunluq olmasa, sayılma meyarı ilə yoxla" : ""}

Doğru cavab: ${answer}
${considered ? `Sayılma Meyarı: ${considered}` : ""}
İstifadəçinin cavabı: ${userAnswer}
          
Bu cavab doğru hesab oluna bilərmi?`,
      });
      return output.correct;
    } catch (error: unknown) {
      console.log(error);
      return false;
    }
  }
}

type Question = (typeof gamePackages)[number]["questions"][number];

const answerVerificationSchema = z.object({ correct: z.boolean() });

const openrouter = createOpenRouter({ apiKey: ENV.OPENROUTER_API_KEY });
