// oxlint-disable typescript/no-extraneous-class
import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service.js";
import { GoogleCalendarService } from "../calendar/calendar.service.js";
import { GameService } from "../game/game.service.js";
import { ScheduleService } from "../schedule/schedule.service.js";
import { BotService } from "./bot.service.js";

@Module({
  providers: [BotService, Function, PrismaService, GoogleCalendarService, GameService, ScheduleService],
})
export class BotModule {}
