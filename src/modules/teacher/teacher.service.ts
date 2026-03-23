import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import type { Teacher } from "@/generated/prisma/client";
import { Chat, type Client, type Message, MessageTypes } from "whatsapp-web.js";
import { sendErrorLog, sendLog } from "@/lib/logger";
import { Yusif } from "@/lib/constants";
import { commands } from "@/lib/utils";
import client from "../bot/client";
import { LogMessages } from "@/lib/logger_messages";

@Injectable()
export class TeacherService {
  constructor(private prisma: PrismaService) {}

  async notifyYusifAboutMessages() {
    try {
      const teachers = await this.getAllTeachers();
      if (!teachers) return null;
      for (const teacher of teachers) {
        const chat = await client.getChatById(teacher.number);
        if (chat.unreadCount !== 0) {
          await client.sendMessage(Yusif, "I think a teacher wrote me but i didn't forward it to group, check it");
          await chat.sendSeen();
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  async forwardMessageToTeacherFromChat(msg: Message) {
    try {
      const shortMatch = msg.body.toLowerCase().match(/@(\w+)/);
      const short = shortMatch ? shortMatch[1] : "";
      if (short) {
        const teachers = await this.getAllTeachers();
        const teacher = teachers?.find((t) => t.name.toLowerCase() === short.toLowerCase());
        if (teacher) {
          msg = await msg.getQuotedMessage();
          msg.body = `*6324E Group 🗣*: ` + msg.body;
          await this.sendOrForwardMessage(client, msg, teacher.number);
          await sendLog(LogMessages.SENDING_MESSAGE_TO_TEACHER, msg);
        } else await msg.reply("Teacher not found!");
      } else await msg.reply("You should write teacher name after @ sign (case insensitive). For example: @yusif");
    } catch (error) {
      await sendErrorLog(LogMessages.SENDING_MESSAGE_TO_TEACHER, msg, error);
    }
  }

  async forwardTeacherMessageTo(chat: Chat, to: string, msg: Message) {
    try {
      const teacher = await this.getTeacher(msg.from);
      if (!teacher) return;
      await chat.sendSeen();
      msg.body = `*${teacher.name} Teacher*: ` + msg.body;
      await this.sendOrForwardMessage(client, msg, to);
      await msg.react("✅");
    } catch (error) {
      await sendErrorLog(LogMessages.TEACHER_MESSAGE_SEND_TO_GROUP, msg, error);
    }
  }

  async sendOrForwardMessage(client: Client, msg: Message, to: string) {
    try {
      const chat = await client.getChatById(to);
      if (!msg.hasMedia) await chat.sendMessage(msg.body);
      else {
        const mediaMetadata = msg as Message & { _data: { size: number } };
        const mediaSize = (mediaMetadata._data.size || 0) / (1024 * 1024);
        if (msg.type !== MessageTypes.VIDEO) {
          if (mediaSize < 5) {
            const media = await msg.downloadMedia();
            await chat.sendMessage(msg.body, { media });
          } else {
            await msg.forward(chat);
          }
          await chat.sendSeen();
        } else {
          await msg.reply("Videos cannot be sent!");
          await msg.react("❌");
        }
      }
    } catch (error) {
      await sendErrorLog(LogMessages.FORWARD_MESSAGE, msg, error);
    }
  }

  async isTeacher(from: string): Promise<boolean> {
    try {
      const teacher = await this.prisma.teacher.findFirst({ where: { number: from } });
      return !!teacher;
    } catch (error) {
      await sendErrorLog("An error happened while checking isTeacher", null, error);
      return false;
    }
  }

  async getTeacher(from: string): Promise<Teacher | null> {
    return await this.prisma.teacher.findUnique({ where: { number: from } });
  }

  async getAllTeachers(): Promise<Teacher[] | null> {
    return await this.prisma.teacher.findMany();
  }

  async createTeacher(msg: Message) {
    try {
      const name = msg.body.replace(commands.isRegister, "").trim();
      if (!name) {
        await msg.reply("You should write your name! For example: /register Yusif");
        return await msg.react("❌");
      }
      await this.prisma.teacher.create({ data: { name, number: msg.from } });
      await msg.reply(
        `Hi *${name}* Teacher, Thank you for registration. You can send me messages all time. And i will forward it to 6324E Group Chat. Your number will not shown!`,
      );
      await sendLog("Teacher created successfully!", msg);
    } catch (error) {
      await sendErrorLog("creating new Teacher", msg, error);
    }
  }
}
