import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AppService } from "./app.service";
import { BotModule } from "./modules/bot/bot.module";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule.forRoot(), EventEmitterModule.forRoot(), BotModule],
  providers: [AppService],
})
export class AppModule {}
