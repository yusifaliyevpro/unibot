import { Injectable } from "@nestjs/common";
import { type calendar_v3, auth, calendar } from "@googleapis/calendar";
import * as dotenv from "dotenv";

dotenv.config();

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

  async getSchedule(day: Date) {
    const startOfDay = new Date(day.setHours(13, 35, 0, 0));
    const endOfDay = new Date(day.setHours(17, 55, 0, 0));

    const response = await this.calendar.events.list({
      calendarId: "6718afcc2fb6b3439a0846b80cb446c032144b1cb90101aee6472ce5f0997ff5@group.calendar.google.com",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: calendar_v3.Schema$Event[] = response.data.items || [];
    return events;
  }

  async getNextLesson(hour: number, minute: number): Promise<string | null> {
    const day = new Date();
    const startDay = new Date(day.setHours(hour, minute, 0, 0));
    const endDay = new Date(startDay.getTime() + 80 * 60000);

    const response = await this.calendar.events.list({
      calendarId: "6718afcc2fb6b3439a0846b80cb446c032144b1cb90101aee6472ce5f0997ff5@group.calendar.google.com",
      timeMin: startDay.toISOString(),
      timeMax: endDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: calendar_v3.Schema$Event[] = response.data.items || [];
    if (events.length) {
      const lessonSummary = events[0].summary;
      if (!lessonSummary) return null;
      const subject = this.getSubject(lessonSummary.split("(")[0].trim().toLowerCase());
      const lessonName = subject ? subject.fullName : undefined;
      const match = lessonSummary.match(/\((\w)\)/);
      const lessonType = match ? " " + match[0].trim() : "";
      let teacher = "";
      if (lessonSummary.split("|").length === 3) {
        teacher = ` | ${lessonSummary.split("|")[1].trim()}`;
      }
      const doorNumberMatch = lessonSummary.match(/\d-\d{3}/);
      const doorNumber = doorNumberMatch ? doorNumberMatch[0].trim() : "unknown";
      return `⌛ _*${lessonName + lessonType + teacher}*_ starts in *15 minutes* at *${doorNumber}*`;
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
