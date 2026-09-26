import { Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import * as QRCode from "qrcode";
import { groups, SCHOOL_DAYS, SHIFT, SuperAdminID, UniBotID } from "../../lib/constants.js";
import { isSalam, isLion, getCommand, atTime, nextSchoolDay, cleanPrompt } from "../../lib/utils.js";
import { type GroupChat } from "../../lib/whatsapp.ts";
import { GoogleCalendarService } from "../calendar/calendar.service.js";
import { GameService } from "../game/game.service.js";
import { ScheduleService } from "../schedule/schedule.service.js";
import client from "./client.js";
import { handleAIGroupMention } from "./handlers/ai.handler.js";
import { handleHelpBox } from "./handlers/help.handler.js";
import { handleConvertToPDF } from "./handlers/pdf.handler.js";
import { handleSticker } from "./handlers/sticker.handler.js";

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private gameService: GameService,
    private scheduleService: ScheduleService,
    private calendarService: GoogleCalendarService,
  ) {}

  async onModuleInit() {
    client.on("authenticated", () => {
      this.logger.log("AUTHENTICATED");
    });
    client.on("auth_failure", () => {
      console.error("AUTHENTICATION FAILURE");
    });
    client.on("ready", async () => {
      await client.sendPresenceAvailable();

      this.logger.log("🟢 You're connected successfully!");
      // NOTE: DELETE THIS PART, If you just forked the repo and want to test it.
      const uniChat = (await client.getChatById(groups.UNICHAT)) as GroupChat;
      const uniMates = uniChat.participants.map((participant) => participant.id._serialized);
      const uniBotId = await client.getLid(UniBotID);
      const superAdminId = await client.getLid(SuperAdminID);
      // till here

      // "ready" fires again after a re-login, avoid duplicate handlers
      client.removeAllListeners("message");
      client.on("message", async (msg) => {
        try {
          const body = msg.body.trim().toLowerCase();
          const isGroupMateOrChat = [...uniMates, superAdminId, groups.UNICHAT, groups.INFORMATION, groups.FINAL_EXAM].includes(msg.from);
          const commands = getCommand(body);
          const chat = await msg.getChat();
          const quotedMessage = msg.hasQuotedMsg ? await msg.getQuotedMessage() : null;
          const isUniBotMentioned = [...msg.mentionedIds, quotedMessage?.author].some((mention) => mention === uniBotId);
          const isAdmin = chat.isGroup && (chat as GroupChat).participants.some((p) => p.isAdmin && p.id._serialized === msg.author);

          // Utils
          const sendStateTyping = async () => await chat.sendStateTyping();

          // If have an active Game session
          if (await this.gameService.hasActiveSession(msg.from)) {
            if (Object.values(commands).some(Boolean) && !commands.isQuit && !commands.isRight && !commands.isPass) {
              return await msg.reply("Hal-hazırda aktiv sessiyanız var, əmrdən istifadə edə bilmək üçün oyunu bağlayın!");
            }
            return await this.gameService.handleGame(msg, chat, isAdmin);
          }

          // Start a new Game
          if (commands.isStart) {
            await sendStateTyping();
            if (chat.isGroup && !isAdmin) return await msg.reply("Sadəcə qrup Adminləri oyun başlada bilər!");
            await this.gameService.handleGameStart(msg, chat);
          }

          // Send AI response (the super admin can also talk to it in private with /unibot)
          const isSuperAdminUniBotCall = !chat.isGroup && commands.isUniBot && msg.from === superAdminId;
          if ((isUniBotMentioned && chat.isGroup) || isSuperAdminUniBotCall) {
            if (cleanPrompt(msg.body) === "") {
              if (msg.hasQuotedMsg) msg = await msg.getQuotedMessage();
              else return;
            }
            return await handleAIGroupMention(msg, chat, isGroupMateOrChat, this.scheduleService);
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
          if (commands.isSchedule && isGroupMateOrChat) {
            await sendStateTyping();
            const weekday = body.match(/\/schedule\s+([1-5])\b/)?.[1];
            if (weekday) {
              const week = commands.isUpper ? "upper" : commands.isLower ? "lower" : undefined;
              await this.scheduleService.sendDaySchedule(chat, Number(weekday), week);
            } else await this.scheduleService.sendSchedule(chat, commands.isForTomorrow);
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

          // Echo Message
          if (commands.isEcho) {
            await sendStateTyping();
            await chat.sendMessage(msg.body.replace(/\/echo/i, "").trim(), { linkPreview: false });
          }
        } catch (error) {
          console.log(error);
        }
      });
    });

    client.on("qr", async (qr) => {
      console.log(await QRCode.toString(qr, { small: true, type: "terminal" }));
    });

    client.on("disconnected", async () => {
      this.logger.warn("Client disconnected, attempting to restart...");
      await client.initialize().then(() => this.logger.log("🟢 Whatsapp web is initialized successfully again!"));
    });

    await client.initialize().then(() => this.logger.log("🟢 Whatsapp web is initialized successfully!"));
  }

  private async sendDailySchedule(time: "beforeLastSlot" | "afterLastSlot") {
    try {
      const now = new Date();
      const todayEvents = await this.calendarService.getSchedule(now);
      const hasLastSlotLesson = todayEvents.some((event) => {
        const startTime = new Date(event.start?.dateTime || event.start?.date || "");
        return startTime >= atTime(now, SHIFT.lastSlotStart) && startTime < atTime(now, SHIFT.end);
      });

      // Post right after the day's last lesson
      if (time === "beforeLastSlot" && hasLastSlotLesson) return;
      if (time === "afterLastSlot" && !hasLastSlotLesson) return;

      // On the last lesson day of the week this is Monday's schedule
      const targetDay = nextSchoolDay(new Date(), SCHOOL_DAYS);

      const lessons = await this.calendarService.getSchedule(targetDay);
      const scheduleText = this.scheduleService.generateScheduleText(lessons, targetDay);
      for (const group of [groups.UNICHAT, groups.INFORMATION]) {
        // A failure in one group must not keep the schedule from the other
        try {
          const chat = await client.getChatById(group);
          const schmsg = await chat.sendMessage(scheduleText);
          await schmsg?.pin(86400);
        } catch (error) {
          console.error(`Failed to post the schedule to ${group}`, error);
        }
      }
      this.logger.verbose(`Sent schedule to group at ${time}`);
    } catch (error) {
      console.error("An error occured while sending cron tasks and schedule", error);
    }
  }

  @Cron(SHIFT.scheduleCrons.beforeLastSlot) private async _1() {
    await this.sendDailySchedule("beforeLastSlot");
  }

  @Cron(SHIFT.scheduleCrons.afterLastSlot) private async _2() {
    await this.sendDailySchedule("afterLastSlot");
  }

  private async sendDoorNumber(lesson: string) {
    const [hour, minute] = lesson.split(":").map(Number);
    try {
      const nextLessonText = await this.calendarService.getNextLesson(hour, minute);
      console.log(nextLessonText);
      if (nextLessonText) await client.sendMessage(groups.UNICHAT, nextLessonText);
      this.logger.verbose(`${hour}:${minute} door number sent!`);
    } catch (error) {
      this.logger.error(`An error occurred while sending ${hour}:${minute} door number`, error);
    }
  }

  @Cron(SHIFT.doorReminders[0].cron) private async _3() {
    await this.sendDoorNumber(SHIFT.doorReminders[0].lesson);
  }
  @Cron(SHIFT.doorReminders[1].cron) private async _4() {
    await this.sendDoorNumber(SHIFT.doorReminders[1].lesson);
  }
  @Cron(SHIFT.doorReminders[2].cron) private async _5() {
    await this.sendDoorNumber(SHIFT.doorReminders[2].lesson);
  }
}
