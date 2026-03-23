import { Injectable } from "@nestjs/common";
import { tomorrow } from "@/lib/utils";
import { GoogleCalendarService } from "src/modules/calendar/calendar.service";
import { Chat } from "whatsapp-web.js";
import { getWeek } from "date-fns";
import { calendar_v3 } from "@googleapis/calendar";

@Injectable()
export class ScheduleService {
  constructor(private calendarService: GoogleCalendarService) {}

  async sendSchedule(chat: Chat, isForTomorrow: boolean) {
    try {
      const { dayLabel, targetDay } = this.getDay(isForTomorrow);
      const week = getWeek(targetDay);
      const events = await this.calendarService.getSchedule(targetDay);
      const scheduleMessage = this.generateScheduleText(events, isForTomorrow, week % 2 == 0);
      const schmsg = await chat.sendMessage(scheduleMessage);
      console.log(`Schedule for ${dayLabel} sent to ${chat.name}`);
      return schmsg;
    } catch (error) {
      console.error(error);
    }
  }

  generateScheduleText(events: calendar_v3.Schema$Event[], isForTomorrow: boolean, isUpper: boolean) {
    const { dayLabel } = this.getDay(isForTomorrow);
    if (!events.length) return `You are free ${dayLabel}😊`;

    let schedule = `${new Date().getDay() !== 4 ? (isForTomorrow ? "*Tomorrow*" : "*Today*") : "*Monday*"} (*${isUpper ? "UPPER" : "LOWER"}*)\n\n`;
    events.map((event) => {
      const { start, end } = this.extractEventTimeRange(event);
      schedule += `📅 ${start}-${end} | ${event.summary}\n`;
    });

    return schedule.trim();
  }

  private extractEventTimeRange(event: calendar_v3.Schema$Event): { start: string; end: string } {
    const options: Intl.DateTimeFormatOptions = { hour12: false, hour: "2-digit", minute: "2-digit" };
    const start = new Date((event.start?.dateTime || event.start?.date) as string).toLocaleString("en-US", options);
    const end = new Date((event.end?.dateTime || event.end?.date) as string).toLocaleString("en-US", options);

    return { start, end };
  }

  private getDay(isForTomorrow: boolean) {
    const today = new Date();
    const dayLabel = isForTomorrow ? "tomorrow" : "today";
    const targetDay = isForTomorrow ? tomorrow(today) : today;
    return { dayLabel, targetDay };
  }
}
