import type { calendar_v3 } from "@googleapis/calendar";
import { Injectable } from "@nestjs/common";
import { isSameDay } from "date-fns";
import { tomorrow, weekType } from "../../lib/utils.js";
import type { Chat } from "../../lib/whatsapp.ts";
import { GoogleCalendarService } from "../../modules/calendar/calendar.service.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

@Injectable()
export class ScheduleService {
  constructor(private calendarService: GoogleCalendarService) {}

  async sendSchedule(chat: Chat, isForTomorrow: boolean) {
    const targetDay = isForTomorrow ? tomorrow(new Date()) : new Date();
    const events = await this.calendarService.getSchedule(targetDay);
    return await chat.sendMessage(this.generateScheduleText(events, targetDay));
  }

  /** weekday: 1 (Monday) - 5 (Friday). Without week, both weeks are sent (as one if they're identical) */
  async sendDaySchedule(chat: Chat, weekday: number, week?: "upper" | "lower") {
    const dayName = WEEKDAYS[weekday - 1];
    const date = new Date();
    date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
    const nextWeek = new Date(date);
    nextWeek.setDate(date.getDate() + 7);
    const [upperDate, lowerDate] = weekType(date) === "upper" ? [date, nextWeek] : [nextWeek, date];

    if (week) {
      const events = await this.calendarService.getSchedule(week === "upper" ? upperDate : lowerDate);
      return await chat.sendMessage(this.formatSchedule(`*${dayName}* (*${week.toUpperCase()}*)`, events));
    }

    const [upper, lower] = await Promise.all([this.calendarService.getSchedule(upperDate), this.calendarService.getSchedule(lowerDate)]);
    if (this.eventLines(upper) === this.eventLines(lower)) return await chat.sendMessage(this.formatSchedule(`*${dayName}*`, upper));
    await chat.sendMessage(this.formatSchedule(`*${dayName}* (*UPPER*)`, upper));
    await chat.sendMessage(this.formatSchedule(`*${dayName}* (*LOWER*)`, lower));
  }

  /** Titled "Today", "Tomorrow" or the weekday name of `targetDay`, with its week type */
  generateScheduleText(events: calendar_v3.Schema$Event[], targetDay: Date) {
    const today = new Date();
    const dayLabel = isSameDay(targetDay, today) ? "today" : isSameDay(targetDay, tomorrow(new Date(today))) ? "tomorrow" : null;
    const dayName = targetDay.toLocaleDateString("en-US", { weekday: "long" });
    if (!events.length) return `You are free ${dayLabel ?? `on ${dayName}`}😊`;

    const title = dayLabel ? `${dayLabel[0].toUpperCase()}${dayLabel.slice(1)}` : dayName;
    return this.formatSchedule(`*${title}* (*${weekType(targetDay).toUpperCase()}*)`, events);
  }

  private formatSchedule(title: string, events: calendar_v3.Schema$Event[]) {
    return `${title}\n\n${events.length ? this.eventLines(events) : "You are free😊"}`;
  }

  private eventLines(events: calendar_v3.Schema$Event[]) {
    return events
      .map((event) => {
        // All-day events (e.g. holidays) have a date but no time
        if (!event.start?.dateTime) return `📅 All day | ${event.summary}`;
        const { start, end } = this.extractEventTimeRange(event);
        return `📅 ${start}-${end} | ${event.summary}`;
      })
      .join("\n");
  }

  private extractEventTimeRange(event: calendar_v3.Schema$Event): { start: string; end: string } {
    const options: Intl.DateTimeFormatOptions = { hourCycle: "h23", hour: "2-digit", minute: "2-digit" };
    const start = new Date((event.start?.dateTime || event.start?.date) as string).toLocaleString("en-US", options);
    const end = new Date((event.end?.dateTime || event.end?.date) as string).toLocaleString("en-US", options);

    return { start, end };
  }
}
