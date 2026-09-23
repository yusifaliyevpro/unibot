// oxlint-disable typescript/no-extraneous-class
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaService } from "../../prisma.service.js";
import { GoogleCalendarService } from "../calendar/calendar.service.js";
import { GameService } from "../game/game.service.js";
import { ScheduleService } from "../schedule/schedule.service.js";
import { TeacherService } from "../teacher/teacher.service.js";
import { BotController } from "./bot.controller.js";
import { BotService } from "./bot.service.js";

@Module({
  imports: [EventEmitterModule],
  controllers: [BotController],
  providers: [BotService, Function, PrismaService, GoogleCalendarService, GameService, ScheduleService, TeacherService],
})
export class BotModule {}
