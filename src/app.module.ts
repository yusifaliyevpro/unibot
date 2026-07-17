// oxlint-disable typescript/no-extraneous-class
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { AppService } from "./app.service";
import { BotModule } from "./modules/bot/bot.module";

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule.forRoot(), EventEmitterModule.forRoot(), BotModule],
  providers: [AppService],
})
export class AppModule {}
