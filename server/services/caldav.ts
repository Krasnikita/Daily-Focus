import { DAVClient } from "tsdav";
import type { CalendarEvent, AppConfig } from "@shared/schema";
import { RUSSIAN_DAYS } from "@shared/schema";

export class CalDAVService {
  private config: AppConfig["caldav"];

  constructor(config: AppConfig["caldav"]) {
    this.config = config;
  }

  async fetchEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    const client = new DAVClient({
      serverUrl: this.config.serverUrl,
      credentials: {
        username: this.config.username,
        password: this.config.password,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    await client.login();

    const calendars = await client.fetchCalendars();
    
    if (calendars.length === 0) {
      throw new Error("No calendars found");
    }

    // Use specified calendar path or first available calendar
    let targetCalendar = calendars[0];
    if (this.config.calendarPath) {
      const found = calendars.find(c => c.url.includes(this.config.calendarPath!));
      if (found) {
        targetCalendar = found;
      }
    }

    const calendarObjects = await client.fetchCalendarObjects({
      calendar: targetCalendar,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });

    const events: CalendarEvent[] = [];

    for (const obj of calendarObjects) {
      if (!obj.data) continue;
      
      const parsed = this.parseICalEvent(obj.data);
      if (parsed) {
        events.push(parsed);
      }
    }

    return events;
  }

  private parseICalEvent(icalData: string): CalendarEvent | null {
    try {
      const lines = icalData.split(/\r?\n/);
      let uid = "";
      let summary = "";
      let dtstart = "";
      let dtend = "";
      let description = "";

      for (const line of lines) {
        if (line.startsWith("UID:")) {
          uid = line.substring(4);
        } else if (line.startsWith("SUMMARY:")) {
          summary = line.substring(8);
        } else if (line.startsWith("DTSTART")) {
          const match = line.match(/:(.*)/);
          if (match) dtstart = match[1];
        } else if (line.startsWith("DTEND")) {
          const match = line.match(/:(.*)/);
          if (match) dtend = match[1];
        } else if (line.startsWith("DESCRIPTION:")) {
          description = line.substring(12);
        }
      }

      if (!uid || !summary || !dtstart) {
        return null;
      }

      return {
        uid,
        summary,
        start: this.parseICalDate(dtstart),
        end: dtend ? this.parseICalDate(dtend) : this.parseICalDate(dtstart),
        description: description || undefined,
      };
    } catch (error) {
      console.error("Failed to parse iCal event:", error);
      return null;
    }
  }

  private parseICalDate(dateStr: string): Date {
    // Handle formats: 20240115T100000Z or 20240115T100000 or 20240115
    const cleaned = dateStr.replace(/[TZ]/g, "");
    
    if (cleaned.length >= 8) {
      const year = parseInt(cleaned.substring(0, 4));
      const month = parseInt(cleaned.substring(4, 6)) - 1;
      const day = parseInt(cleaned.substring(6, 8));
      const hour = cleaned.length >= 10 ? parseInt(cleaned.substring(8, 10)) : 0;
      const minute = cleaned.length >= 12 ? parseInt(cleaned.substring(10, 12)) : 0;
      
      if (dateStr.endsWith("Z")) {
        return new Date(Date.UTC(year, month, day, hour, minute));
      }
      return new Date(year, month, day, hour, minute);
    }
    
    return new Date(dateStr);
  }

  async fetchWeekEvents(): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfWeek = this.getStartOfWeek(now);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    try {
      return await this.fetchEvents(startOfWeek, endOfWeek);
    } catch (error) {
      console.error("CalDAV error:", error);
      throw new Error(`Ошибка при получении календаря: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async fetchEventsFromTodayOnwards(): Promise<CalendarEvent[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endOfWeek = this.getEndOfWorkWeek(now);

    try {
      return await this.fetchEvents(now, endOfWeek);
    } catch (error) {
      console.error("CalDAV error:", error);
      throw new Error(`Ошибка при получении календаря: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async fetchTodayEvents(): Promise<CalendarEvent[]> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    try {
      const events = await this.fetchEvents(todayStart, todayEnd);
      console.log(`CalDAV fetched ${events.length} events for today (${todayStart.toISOString()} to ${todayEnd.toISOString()})`);
      return events;
    } catch (error) {
      console.error("CalDAV error:", error);
      throw new Error(`Ошибка при получении календаря: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private getEndOfWorkWeek(date: Date): Date {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    let daysUntilFriday: number;
    
    if (dayOfWeek === 0) {
      daysUntilFriday = 5;
    } else if (dayOfWeek === 6) {
      daysUntilFriday = 6;
    } else {
      daysUntilFriday = 5 - dayOfWeek;
    }
    
    d.setDate(d.getDate() + daysUntilFriday);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
