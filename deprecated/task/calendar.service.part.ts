// async getNextSubject(subject: string): Promise<Date | null> {
//   const day = tomorrow(new Date());
//   const startDay = new Date(day.setHours(13, 35, 0, 0));
//   const endDay = new Date(new Date(day.setDate(day.getDate() + 30)).setHours(17, 55, 0, 0));

//   const response = await this.calendar.events.list({
//     calendarId: "primary",
//     timeMin: startDay.toISOString(),
//     timeMax: endDay.toISOString(),
//     singleEvents: true,
//     orderBy: "startTime",
//   });

//   const events: calendar_v3.Schema$Event[] = response.data.items || [];
//   const subjectEvent = events.find((event) => event.summary?.toLowerCase().includes(subject));
//   if (subjectEvent && subjectEvent.start) {
//     const startDate = subjectEvent.start.dateTime || subjectEvent.start.date;
//     if (startDate) return new Date(new Date(startDate).setHours(0, 0, 0, 0));
//   }
//   return null;
// }
