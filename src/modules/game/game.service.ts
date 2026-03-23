import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/src/prisma.service";
import { GameSession, Prisma } from "@/generated/prisma/client";
import { gamePackages } from "@/src/3sual";
import WAWebJS, { Chat, GroupChat, Message, MessageMedia } from "whatsapp-web.js";
import { getCommand } from "@/lib/utils";
import { sendErrorLog, sendLog } from "@/lib/logger";
import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ENV } from "@/lib/env";
import client from "@/modules/bot/client";
import { gameMsgs, LogMessages } from "@/lib/logger_messages";

@Injectable()
export class GameService {
  constructor(private prisma: PrismaService) {}

  async handleGame(msg: WAWebJS.Message, chat: WAWebJS.Chat, isAdmin: boolean) {
    const reactSuccess = async () => await msg.react("✅");
    const reactError = async () => await msg.react("❌");
    try {
      const body = msg.body.trim().toLowerCase();
      const { isQuit, isRight, isPass } = getCommand(body);
      const sendStateTyping = async () => await chat.sendStateTyping();
      const sendMessage = async (message: string | MessageMedia) => await chat.sendMessage(message);

      const sendQuestion = async (message: string, rekvizit: null | { text: boolean; rekvizit: string }) => {
        let questionText = message.trim();
        if (rekvizit) {
          if (rekvizit.text) questionText = "_*Rekvizit:*_ " + rekvizit.rekvizit.trim() + "\n\n" + questionText;
          else {
            const codeImage = await MessageMedia.fromUrl("https://api.3sual.az/images/" + rekvizit.rekvizit);
            await sendMessage(codeImage);
          }
        }
        await sendMessage(questionText);
      };
      const session = await this.GameSession({ isActive: true, phoneNumber: msg.from });
      if (!session) return;
      const gamePackage = gamePackages[session.packageIndex];
      const isFinished = gamePackage.questions.length === session.lastQuestion + 1;
      let question = gamePackage.questions[session.lastQuestion];
      const updateLast = async () => await this.UpdateLastQuestion(session.id);
      const answerText =
        `*Cavab: ${question.answer.trim()}*\n\n` +
        `*Müəllif${question.authors.length > 1 ? "lər" : ""}:* ${question.authors ? `${question.authors.join(", ")}` : "Yoxdur"}\n\n` +
        `${question.considered ? `*Meyar:* ${question.considered.trim()}\n\n` : ""}` +
        `*Şərh:* ${question.comment?.trim() || "*Yoxdur*"}`;

      const sendAnswer = async () => await msg.reply(answerText, undefined, { linkPreview: false });

      if (isAdmin && msg.hasQuotedMsg && isRight) {
        const quotedMsg = await msg.getQuotedMessage();
        await quotedMsg.react("✅");
        await quotedMsg.reply(answerText, undefined, { linkPreview: false });
        await updateLast();
        await this.markAsCorrect(session.id);
        if (!isFinished) {
          await sendStateTyping();
          question = gamePackage.questions[session.lastQuestion + 1];
          await sendQuestion(`${session.lastQuestion + 2}. ${question.question}`, question.rekvizit);
        }
      } else if (isQuit) {
        await sendStateTyping();
        if (chat.isGroup && !isAdmin) await msg.reply(gameMsgs.ONLY_ADMINS_CAN_QUIT);
        await sendAnswer();
        await this.quitGame(chat, msg, session, gamePackage.questions.length);
      } else if (isPass) {
        await sendStateTyping();
        await updateLast();
        await sendAnswer();
        await sendStateTyping();
        if (!isFinished) {
          question = gamePackage.questions[session.lastQuestion + 1];
          await sendQuestion(`${session.lastQuestion + 2}. ${question.question}`, question.rekvizit);
        }
      } else {
        await msg.react("⏳");
        if (
          body.includes(question.answer.toLowerCase()) ||
          (question.considered && body.includes(question.considered.toLowerCase())) ||
          (await this.verifyAnswerByAI(question.answer, question.considered, msg.body))
        ) {
          await sendStateTyping();
          await reactSuccess();
          await sendAnswer();
          await updateLast();
          await this.markAsCorrect(session.id);
          if (!isFinished) {
            question = gamePackage.questions[session.lastQuestion + 1];
            await sendQuestion(`${session.lastQuestion + 2}. ${question.question}`, question.rekvizit);
          }
        } else {
          await reactError();
        }
      }

      if (gamePackage.questions.length === session.lastQuestion + 1) {
        await reactSuccess();
        await this.quitGame(chat, msg, session, gamePackage.questions.length);
      }
    } catch (error) {
      await sendErrorLog(LogMessages.GAME_HANDLER, msg, error);
    }
  }

  async handleGameStart(msg: WAWebJS.Message, chat: WAWebJS.Chat) {
    try {
      const sendQuestion = async (message: string, rekvizit: null | { text: boolean; rekvizit: string }) => {
        let questionText = message.trim();
        if (rekvizit) {
          if (rekvizit.text) questionText = "_*Rekvizit:*_ " + rekvizit.rekvizit.trim() + "\n\n" + questionText;
          else {
            const rekvizitImagePath = "https://api.3sual.az/images/" + rekvizit.rekvizit;
            const codeImage = await MessageMedia.fromUrl(rekvizitImagePath);
            await chat.sendMessage(codeImage);
          }
        }
        await chat.sendMessage(questionText, { linkPreview: false });
      };

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
          `${gamePackage.editors ? `*Redaktor${gamePackage.editors.length > 1 ? "lar" : ""}*: ${gamePackage.editors.join(", ")}\n` : ""}` +
          `Paket linki: https://3sual.az/package/${gamePackage.id}`,
        { linkPreview: false },
      );

      const question = gamePackage.questions[session.lastQuestion];
      await sendQuestion(`${session.lastQuestion + 1}. ${question.question}`, question.rekvizit);

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

  private async quitGame(chat: Chat, msg: Message, session: GameSession, questionCount: number) {
    await this.prisma.gameSession.update({ data: { isActive: false }, where: { id: session.id } });

    await chat.sendMessage(
      `🧾 Paketdəki sualların sayı: ${questionCount}
📈 Oynanılan sual sayı: ${session.lastQuestion + 1}
✅ Doğru cavabların sayı: ${session.numberOfCorrectAnswers}`,
    );
    await msg.reply(gameMsgs.FINISHED);
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
      const { object } = await generateObject({
        model: openrouter("deepseek/deepseek-chat-v3.1"),
        schema: answerVerificationSchema,
        prompt: `Sən çox dəqiq çalışan yoxlayıcı bir oyun süni intellektisən.
İstifadəçinin cavabının düzgün olub-olmadığını aşağıdakı "doğru cavab"a əsaslanaraq qiymətləndir.
Kiçik yazı səhvlərinə, fərqli yazılışlara, sinonimlərə və eyni mənanı verən ifadələrə icazə ver.
          
${considered && "Sayılma meyarı isə cavabın yazıla biləcəyi 2-ci variantdır, əgər əsas cavabla uyğunluq olmasa, sayılma meyarı ilə yoxla"}

Doğru cavab: ${answer}
${considered && `Sayılma Meyarı: ${considered}`}
İstifadəçinin cavabı: ${userAnswer}
          
Bu cavab doğru hesab oluna bilərmi?`,
      });
      return object.correct;
    } catch (error: unknown) {
      console.log(error);
      return false;
    }
  }
}

const answerVerificationSchema = z.object({ correct: z.boolean() });

const openrouter = createOpenRouter({ apiKey: ENV.OPENROUTER_API_KEY });
