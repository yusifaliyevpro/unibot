// oxlint-disable typescript/no-extraneous-class
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaService } from "@/src/prisma.service";
import { GoogleCalendarService } from "../calendar/calendar.service";
import { GameService } from "../game/game.service";
import { ScheduleService } from "../schedule/schedule.service";
import { TeacherService } from "../teacher/teacher.service";
import { BotController } from "./bot.controller";
import { BotService } from "./bot.service";

@Module({
  imports: [EventEmitterModule],
  controllers: [BotController],
  providers: [BotService, Function, PrismaService, GoogleCalendarService, GameService, ScheduleService, TeacherService],
})
export class BotModule {}
