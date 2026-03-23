import { Injectable } from "@nestjs/common";
import { OnModuleInit } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { type GroupChat } from "whatsapp-web.js";
import { GoogleCalendarService } from "../calendar/calendar.service";
import { groups, Yusif, UniBotID } from "@/lib/constants";
import { isSalam, isLion, getCommand, tomorrow } from "@/lib/utils";
import { GameService } from "../game/game.service";
import client from "./client";
import { handleHelpBox } from "./handlers/help.handler";
import { ScheduleService } from "../schedule/schedule.service";
import { TeacherService } from "../teacher/teacher.service";
import { handleSticker } from "./handlers/sticker.handler";
import { handleAIGroupMention } from "./handlers/ai.handler";
import * as QRCode from "qrcode";
import { handleConvertToPDF } from "./handlers/pdf.handler";
import { Cron } from "@nestjs/schedule";
import { getWeek } from "date-fns";

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private gameService: GameService,
    private scheduleService: ScheduleService,
    private teacherService: TeacherService,
    private calendarService: GoogleCalendarService,
  ) {}

  async onModuleInit() {
    client.on("authenticated", () => {
      this.logger.log("AUTHENTICATED");
    });
    client.on("auth_failure", () => {
      console.error("AUTHENTICATION FAILURE");
    });
    client.on("loading_screen", (percent) => {
      this.logger.log(`Loading... ${percent}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    client.on("ready", async () => {
      await client.sendPresenceAvailable();
      await client.setAutoDownloadDocuments(false);
      await client.setAutoDownloadPhotos(false);
      await client.setAutoDownloadAudio(false);
      await client.setAutoDownloadVideos(false);

      this.logger.log("🟢 You're connected successfully!");
      const uniChat = (await client.getChatById(groups.UNICHAT)) as GroupChat;
      const uniMates = uniChat.participants.map((participant) => participant.id._serialized);
      await this.teacherService.notifyYusifAboutMessages();

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      client.on("message", async (msg) => {
        try {
          const body = msg.body.trim().toLowerCase();
          const isGroupMateOrChat = [...uniMates, groups.UNICHAT, groups.INFORMATION, groups.FINAL_EXAM].includes(msg.from);
          const commands = getCommand(body);
          const chat = await msg.getChat();
          const isTeacher = await this.teacherService.isTeacher(msg.from);
          const quotedMessage = msg.hasQuotedMsg ? await msg.getQuotedMessage() : null;
          const isUniBotMentioned = [...msg.mentionedIds, quotedMessage?.author].some((mention) => mention === UniBotID);
          const isAdmin = chat.isGroup && (chat as GroupChat).participants.some((p) => p.isAdmin && p.id._serialized === msg.author);

          // Utils
          const sendStateTyping = async () => await chat.sendStateTyping();

          // Send read receipt
          await chat.sendSeen();

          // If have an active Game session
          if (await this.gameService.hasActiveSession(msg.from)) {
            if (Object.values(commands).some(Boolean) && !commands.isQuit && !commands.isRight && !commands.isPass) {
              return await msg.reply("Hal-hazırda aktiv sessiyanız var, əmrdən istifadə edə bilmək üçün oyunu bağlayın!");
            }
            return await this.gameService.handleGame(msg, chat, isAdmin);
          }

          // Start a new Game
          if (commands.isStart && (isAdmin || !chat.isGroup)) {
            await sendStateTyping();
            if (chat.isGroup && !isAdmin) return await msg.reply("Sadəcə qrup Adminləri oyun başlada bilər!");
            await this.gameService.handleGameStart(msg, chat);
          }

          // Teacher Registration
          if (!chat.isGroup && commands.isRegister && !body.includes("@quote")) {
            await sendStateTyping();
            await this.teacherService.createTeacher(msg);
            return;
          }

          // Forward message to Teacher
          if (commands.isForwardToTeacher && chat.isGroup && msg.author === Yusif && msg.hasQuotedMsg) {
            await this.teacherService.forwardMessageToTeacherFromChat(msg);
          }

          // Teacher Chat
          if (isTeacher) {
            if (commands.isRegister) {
              return await msg.reply("You already signed up! Just write your messages or send media to forward the *6324E* Group");
            }
            return await this.teacherService.forwardTeacherMessageTo(chat, Yusif, msg);
          }

          // Send AI response
          if (isUniBotMentioned && chat.isGroup) {
            if (msg.body.replace(/@\d{9,15}/g, "").trim() === "") {
              if (msg.hasQuotedMsg) msg = await msg.getQuotedMessage();
              else return;
            }
            return await handleAIGroupMention(msg, chat as GroupChat, isGroupMateOrChat, 1);
          }

          // Send Group msg.from
          if (commands.isConfirm) {
            await sendStateTyping();
            await msg.reply(msg.from, undefined, { linkPreview: false });
            await msg.react("✅");
          }

          // Send 👋 reaction
          if (isSalam(body)) {
            await msg.react("👋");
            if (!chat.isGroup) {
              await sendStateTyping();
              await handleHelpBox(chat, msg, isGroupMateOrChat);
            }
          }

          // Send 🦁 reaction
          if (isLion(body)) await msg.react("🦁");

          // Send HelpBox
          if (commands.isHelp) {
            await sendStateTyping();
            await handleHelpBox(chat, msg, isGroupMateOrChat);
          }

          // Sending Schedule
          if (commands.isSchedule) {
            await sendStateTyping();
            await this.scheduleService.sendSchedule(chat, commands.isForTomorrow);
          }

          // Send Sticker
          if (commands.isSticker && msg.hasQuotedMsg && !commands.isSchedule) {
            await sendStateTyping();
            await handleSticker(msg, chat);
          }

          // Convert to PDF
          if (commands.isPDF) {
            await sendStateTyping();
            if (!msg.hasQuotedMsg) return await msg.reply("You must send it as reply to a document");
            const quotedmsg = await msg.getQuotedMessage();
            await handleConvertToPDF(quotedmsg, msg);
          }

          // Clear Messages
          if (commands.isClear && msg.from === Yusif) {
            await sendStateTyping();
            await chat.sendMessage("Clearing all messages...");
            await this.clearAllMessages();
            await chat.sendMessage("All messages cleared successfully!");
          }

          // Echo Message
          if (commands.isEcho) {
            await sendStateTyping();
            await chat.sendMessage(msg.body.replace("/echo", "").trim(), { linkPreview: false });
          }
        } catch (error) {
          console.log(error);
        }
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    client.on("qr", async (qr) => {
       
      console.log(await QRCode.toString(qr, { small: true, type: "terminal" }));
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    client.on("disconnected", async () => {
      this.logger.warn("Client disconnected, attempting to restart...");
      await client.initialize().then(() => this.logger.log("🟢 Whatsapp web is initialized successfully again!"));
    });

    await client.initialize().then(() => this.logger.log("🟢 Whatsapp web is initialized successfully!"));
  }

  async clearAllMessages() {
    try {
      const chats = await client.getChats();
      this.logger.log(`🧹 Starting to clear messages in ${chats.length} chats...`);
      for (const chat of chats) {
        try {
          if (!(await this.teacherService.isTeacher(chat.id._serialized))) {
            await chat.clearMessages();
            this.logger.log(`🧹 Cleared messages in chat: ${chat.name || chat.id._serialized}`);
          }
        } catch (error) {
          this.logger.error(`❌ Failed to clear messages in chat: ${chat.id._serialized}`, error);
        }
      }

      this.logger.log(`✅ All chats cleared successfully`);
    } catch (error) {
      this.logger.error("❌ An error occurred while clearing all chats", error);
    }
  }

  private async sendDailySchedule(time: "16:20" | "17:50") {
    try {
      const now = new Date();
      const todayEvents = await this.calendarService.getSchedule(now);

      if (time === "16:20") {
        const hasLessonAfter1625 = todayEvents.some((event) => {
          const startTime = new Date(event.start?.dateTime || event.start?.date || "");
          return startTime > new Date(now.setHours(16, 25, 0, 0));
        });

        if (hasLessonAfter1625) return;
      }

      if (time === "17:50") {
        const hasLessonBefore1750 = todayEvents.some((event) => {
          const startTime = new Date(event.start?.dateTime || event.start?.date || "");
          return startTime > new Date(now.setHours(16, 25, 0, 0)) && startTime < new Date(now.setHours(17, 55, 0, 0));
        });

        if (!hasLessonBefore1750) return;
      }

      let targetDay = tomorrow(new Date());
      // If it's Thursday, set target day to next Monday
      if (new Date().getDay() === 4) targetDay = new Date(targetDay.setDate(targetDay.getDate() + 3));

      const UniGroups = [groups.UNICHAT, groups.INFORMATION];
      const week = getWeek(targetDay);
      const lessons = await this.calendarService.getSchedule(targetDay);
      if (!lessons) return;
      for (const group of UniGroups) {
        const chat = await client.getChatById(group);
        const scheduleText = this.scheduleService.generateScheduleText(lessons, true, week % 2 == 0);
        const schmsg = await chat.sendMessage(scheduleText);
        await schmsg?.pin(86400);
      }
      this.logger.verbose(`Sent schedule to group at ${time}`);
    } catch (error) {
      console.error("An error occured while sending cron tasks and schedule", error);
    }
  }

  @Cron("20 16 * * 1-4") private async _1() {
    await this.sendDailySchedule("16:20");
  }

  @Cron("50 17 * * 1-4") private async _2() {
    await this.sendDailySchedule("17:50");
  }

  private async sendDoorNumber(hour: number, minute: number) {
    try {
      const nextLessonText = await this.calendarService.getNextLesson(hour, minute);
      console.log(nextLessonText);
      if (nextLessonText) await client.sendMessage(groups.UNICHAT, nextLessonText);
      this.logger.verbose(`${hour}:${minute} door number sent!`);
    } catch (error) {
      this.logger.error(`An error occurred while sending ${hour}:${minute} door number`, error);
    }
  }

  @Cron("20 13 * * 1-4") private async _3() {
    await this.sendDoorNumber(13, 35);
  }
  @Cron("50 14 * * 1-4") private async _4() {
    await this.sendDoorNumber(14, 55);
  }
  @Cron("20 16 * * 1-4") private async _5() {
    await this.sendDoorNumber(16, 25);
  }
}
