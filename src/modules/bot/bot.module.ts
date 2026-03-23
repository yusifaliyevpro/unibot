import { Module } from "@nestjs/common";
import { BotController } from "./bot.controller";
import { BotService } from "./bot.service";
import { PrismaService } from "src/prisma.service";
import { GameService } from "../game/game.service";
import { ScheduleService } from "../schedule/schedule.service";
import { TeacherService } from "../teacher/teacher.service";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { GoogleCalendarService } from "../calendar/calendar.service";

@Module({
  imports: [EventEmitterModule],
  controllers: [BotController],
  providers: [BotService, Function, PrismaService, GoogleCalendarService, GameService, ScheduleService, TeacherService],
})
export class BotModule {}
