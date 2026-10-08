import type { calendar_v3 } from "@googleapis/calendar";
import { Injectable } from "@nestjs/common";
import { today, toZoned, weekType } from "../../lib/utils.js";
import type { Chat } from "../../lib/whatsapp.ts";
import { GoogleCalendarService } from "../../modules/calendar/calendar.service.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

@Injectable()
export class ScheduleService {
  constructor(private calendarService: GoogleCalendarService) {}

  async sendSchedule(chat: Chat, isForTomorrow: boolean) {
    const targetDay = isForTomorrow ? today().add({ days: 1 }) : today();
    const events = await this.calendarService.getSchedule(targetDay);
    return await chat.sendMessage(this.generateScheduleText(events, targetDay));
  }

  /** weekday: 1 (Monday) - 5 (Friday). Without week, both weeks are sent (as one if they're identical) */
  async sendDaySchedule(chat: Chat, weekday: number, week?: "upper" | "lower") {
    const dayName = WEEKDAYS[weekday - 1];
    const now = today();
    const date = now.add({ days: (weekday - now.dayOfWeek + 7) % 7 });
    const nextWeek = date.add({ weeks: 1 });
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
  generateScheduleText(events: calendar_v3.Schema$Event[], targetDay: Temporal.PlainDate) {
    const now = today();
    const dayLabel = targetDay.equals(now) ? "today" : targetDay.equals(now.add({ days: 1 })) ? "tomorrow" : null;
    const dayName = targetDay.toLocaleString("en-US", { weekday: "long" });
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
        return `📅 ${this.lessonTime(event.start.dateTime)}-${this.lessonTime(event.end?.dateTime)} | ${event.summary}`;
      })
      .join("\n");
  }

  /** "HH:MM" of a Google Calendar `dateTime` */
  private lessonTime(dateTime: string | null | undefined) {
    return dateTime ? toZoned(dateTime).toPlainTime().toString({ smallestUnit: "minute" }) : "?";
  }
}
