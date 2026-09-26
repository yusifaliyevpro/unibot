import type { calendar_v3 } from "@googleapis/calendar";
import { Injectable } from "@nestjs/common";
import { getWeek } from "date-fns";
import { tomorrow } from "../../lib/utils.js";
import type { Chat } from "../../lib/whatsapp.ts";
import { GoogleCalendarService } from "../../modules/calendar/calendar.service.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

@Injectable()
export class ScheduleService {
  constructor(private calendarService: GoogleCalendarService) {}

  async sendSchedule(chat: Chat, isForTomorrow: boolean) {
    try {
      const { dayLabel, targetDay } = this.getDay(isForTomorrow);
      const week = getWeek(targetDay);
      const events = await this.calendarService.getSchedule(targetDay);
      const scheduleMessage = this.generateScheduleText(events, isForTomorrow, week % 2 === 0);
      const schmsg = await chat.sendMessage(scheduleMessage);
      console.log(`Schedule for ${dayLabel} sent to ${chat.name}`);
      return schmsg;
    } catch (error) {
      console.error(error);
    }
  }

  /** weekday: 1 (Monday) - 5 (Friday). Without week, both weeks are sent (as one if they're identical) */
  async sendDaySchedule(chat: Chat, weekday: number, week?: "upper" | "lower") {
    try {
      const dayName = WEEKDAYS[weekday - 1];
      const date = new Date();
      date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
      const nextWeek = new Date(date);
      nextWeek.setDate(date.getDate() + 7);
      const [upperDate, lowerDate] = getWeek(date) % 2 === 0 ? [date, nextWeek] : [nextWeek, date];

      if (week) {
        const events = await this.calendarService.getSchedule(week === "upper" ? upperDate : lowerDate);
        return await chat.sendMessage(this.formatSchedule(`*${dayName}* (*${week.toUpperCase()}*)`, events));
      }

      const [upper, lower] = await Promise.all([this.calendarService.getSchedule(upperDate), this.calendarService.getSchedule(lowerDate)]);
      if (this.eventLines(upper) === this.eventLines(lower)) return await chat.sendMessage(this.formatSchedule(`*${dayName}*`, upper));
      await chat.sendMessage(this.formatSchedule(`*${dayName}* (*UPPER*)`, upper));
      await chat.sendMessage(this.formatSchedule(`*${dayName}* (*LOWER*)`, lower));
    } catch (error) {
      console.error(error);
    }
  }

  generateScheduleText(events: calendar_v3.Schema$Event[], isForTomorrow: boolean, isUpper: boolean) {
    const { dayLabel } = this.getDay(isForTomorrow);
    if (!events.length) return `You are free ${dayLabel}😊`;

    const day = new Date().getDay() !== 4 ? (isForTomorrow ? "*Tomorrow*" : "*Today*") : "*Monday*";
    return this.formatSchedule(`${day} (*${isUpper ? "UPPER" : "LOWER"}*)`, events);
  }

  private formatSchedule(title: string, events: calendar_v3.Schema$Event[]) {
    return `${title}\n\n${events.length ? this.eventLines(events) : "You are free😊"}`;
  }

  private eventLines(events: calendar_v3.Schema$Event[]) {
    return events
      .map((event) => {
        const { start, end } = this.extractEventTimeRange(event);
        return `📅 ${start}-${end} | ${event.summary}`;
      })
      .join("\n");
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
