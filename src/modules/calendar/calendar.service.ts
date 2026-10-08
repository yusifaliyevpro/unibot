import { type calendar_v3, auth, calendar } from "@googleapis/calendar";
import { Injectable } from "@nestjs/common";
import * as dotenv from "dotenv";
import { SHIFT, TIME_ZONE } from "../../lib/constants.js";
import { atTime, today } from "../../lib/utils.js";

dotenv.config({ path: ".env", quiet: true });

type Token = {
  type: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
};
@Injectable()
export class GoogleCalendarService {
  private auth;
  private calendar: calendar_v3.Calendar;

  constructor() {
    this.auth = new auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);

    const googleToken = process.env.GOOGLE_TOKEN;
    if (!googleToken) throw new Error("Google token is not defined in environment variables");
    const token = JSON.parse(googleToken) as Token;
    this.auth.setCredentials(token);
    this.calendar = calendar({ version: "v3", auth: this.auth });
  }

  async getSchedule(day: Temporal.PlainDate) {
    const startOfDay = atTime(day, SHIFT.start);
    const endOfDay = atTime(day, SHIFT.end);

    const response = await this.calendar.events.list({
      calendarId: "6718afcc2fb6b3439a0846b80cb446c032144b1cb90101aee6472ce5f0997ff5@group.calendar.google.com",
      timeMin: startOfDay.toInstant().toString(),
      timeMax: endOfDay.toInstant().toString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: calendar_v3.Schema$Event[] = response.data.items || [];
    return events;
  }

  async getNextLesson(hour: number, minute: number): Promise<string | null> {
    const startDay = today().toZonedDateTime({ timeZone: TIME_ZONE, plainTime: { hour, minute } });
    const endDay = startDay.add({ minutes: 80 });

    const response = await this.calendar.events.list({
      calendarId: "6718afcc2fb6b3439a0846b80cb446c032144b1cb90101aee6472ce5f0997ff5@group.calendar.google.com",
      timeMin: startDay.toInstant().toString(),
      timeMax: endDay.toInstant().toString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    // All-day events (no dateTime) aren't lessons
    const lesson = (response.data.items || []).find((event) => event.start?.dateTime);
    if (lesson) {
      const lessonSummary = lesson.summary;
      if (!lessonSummary) return null;
      const short = lessonSummary.split(/[(|]/)[0].trim();
      const subject = this.getSubject(short.toLowerCase());
      const lessonName = subject ? subject.fullName : short;
      const match = lessonSummary.match(/\((\w)\)/);
      const lessonType = match ? " " + match[0].trim() : "";
      let teacher = "";
      if (lessonSummary.split("|").length === 3) {
        teacher = ` | ${lessonSummary.split("|")[1].trim()}`;
      }
      const doorNumberMatch = lessonSummary.match(/\d-\d{3}/);
      const isOnline = lessonSummary.toLowerCase().includes("online");
      const doorNumber = doorNumberMatch ? doorNumberMatch[0].trim() : "unknown";
      return `⌛ _*${lessonName + lessonType + teacher}*_ starts in *15 minutes* ${isOnline ? "*(Online)*" : `at *${doorNumber}*`}`;
    }
    return null;
  }

  private getSubject(short: string) {
    const subjects = [
      { short: "DM", fullName: "Discrete Mathematics" },
      { short: "XDIAK", fullName: "XDIAK" },
      { short: "CN", fullName: "Computer Networks" },
      { short: "DE", fullName: "Differential Equations" },
      { short: "NM", fullName: "Numerical Methods" },
      { short: "GT", fullName: "Graph Theory" },
    ];
    return subjects.find((subject) => subject.short.toLowerCase() === short);
  }
}
