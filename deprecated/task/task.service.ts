// import { Injectable } from "@nestjs/common";
// import { PrismaService } from "@/src/prisma.service";
// import { Task, Prisma } from "@/generated/prisma/client";
// import { getSubject } from "@/lib/utils";
// import { sendErrorLog, sendLog } from "@/lib/logger";
// import { dateFormatter, getDay, tasksFormatter } from "@/lib/utils";
// import { GoogleCalendarService } from "@/modules/calendar/calendar.service";
// import WAWebJS, { Chat } from "whatsapp-web.js";
// import { LogMessages, userFriendlyMessages } from "@/lib/logger_messages";

// @Injectable()
// export class TaskService {
//   constructor(
//     private prisma: PrismaService,
//     private calendarService: GoogleCalendarService,
//   ) {}

//   async handleAddTask(msg: WAWebJS.Message) {
//     try {
//       const shortMatch = msg.body.toLowerCase().match(/@(\w+)/);
//       const short = shortMatch ? shortMatch[1] : "";
//       const subject = getSubject(short);
//       if (!msg.hasQuotedMsg) return await msg.reply("You should send this message as reply");
//       if (!subject) return await msg.reply("You didn't specify the subject, @os, @ca, @xdiak, @bop, @ma, @ah");
//       if (/(?:^|\s)\/add\s+@\w+/.test(msg.body.toLowerCase())) {
//         const taskDay = await this.calendarService.getNextSubject(subject.short.toLowerCase());
//         if (!taskDay) return await msg.reply(`There are no lessons for *${subject.fullName}*`);
//         const quote = await msg.getQuotedMessage();
//         await this.createTask({ subject: subject.fullName, taskDay, taskText: quote.body });
//         await quote.reply(`📋 Task added for *${subject.fullName}* on *${dateFormatter(taskDay)}*`);
//         await msg.react("✅");

//         await sendLog(LogMessages.NEW_TASK, msg);
//       }
//     } catch (error) {
//       await msg.reply(userFriendlyMessages.NEW_TASK_FAIL);
//       await sendErrorLog(LogMessages.NEW_TASK, msg, error);
//     }
//   }

//   async sendTasks(chat: Chat, isForTomorrow: boolean) {
//     try {
//       const { dayLabel, targetDay } = getDay(isForTomorrow);
//       const tasks = await this.getTasks({ taskDay: targetDay });
//       await chat.sendMessage(tasksFormatter(tasks, isForTomorrow));
//       console.log(`Tasks for ${dayLabel} sent`);
//     } catch (error) {
//       console.log("sending tasks", error);
//     }
//   }

//   async getTask(TaskWhereUniqueInput: Prisma.TaskWhereUniqueInput): Promise<Task | null> {
//     return await this.prisma.task.findUnique({
//       where: TaskWhereUniqueInput,
//     });
//   }

//   async getTasks(where: Prisma.TaskWhereInput): Promise<Task[] | []> {
//     return await this.prisma.task.findMany({
//       where,
//     });
//   }

//   private async createTask(data: Prisma.TaskCreateInput): Promise<Task> {
//     return await this.prisma.task.create({
//       data,
//     });
//   }
// }
