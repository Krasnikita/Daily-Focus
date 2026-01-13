import type { CalendarEvent } from "@shared/schema";

export interface TodayMeeting {
  summary: string;
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface DayAnalysis {
  freeHours: number;
  dayCategory: string;
  todayMeetings: TodayMeeting[];
  hasLongFocusSlot: boolean;
  recommendedTasks: string[];
  hasInternalStatusUpcoming: boolean;
  hasProductReviewUpcoming: boolean;
}

const WORK_START_HOUR = 10;
const WORK_END_HOUR = 18;
const WORK_HOURS = WORK_END_HOUR - WORK_START_HOUR; // 8 hours
const BREAK_HOURS = 1.5;

export class AgendaService {
  
  analyzeTodayMeetings(events: CalendarEvent[], today: Date): TodayMeeting[] {
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayMeetings: TodayMeeting[] = [];

    for (const event of events) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      if (eventStart >= todayStart && eventStart <= todayEnd) {
        const durationMinutes = Math.round((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60));
        todayMeetings.push({
          summary: event.summary,
          start: eventStart,
          end: eventEnd,
          durationMinutes,
        });
      }
    }

    return todayMeetings.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  calculateFreeHours(todayMeetings: TodayMeeting[], today: Date): number {
    const workStart = new Date(today);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    const workEnd = new Date(today);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    let meetingMinutes = 0;

    for (const meeting of todayMeetings) {
      const meetingStart = new Date(Math.max(meeting.start.getTime(), workStart.getTime()));
      const meetingEnd = new Date(Math.min(meeting.end.getTime(), workEnd.getTime()));

      if (meetingStart < meetingEnd) {
        meetingMinutes += (meetingEnd.getTime() - meetingStart.getTime()) / (1000 * 60);
      }
    }

    const meetingHours = meetingMinutes / 60;
    const freeHours = WORK_HOURS - BREAK_HOURS - meetingHours;

    return Math.max(0, Math.round(freeHours * 10) / 10);
  }

  hasLongFocusSlot(todayMeetings: TodayMeeting[], today: Date, minSlotHours: number = 2): boolean {
    const workStart = new Date(today);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    const workEnd = new Date(today);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    const meetings = todayMeetings
      .filter(m => m.start < workEnd && m.end > workStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (meetings.length === 0) {
      return true;
    }

    let currentTime = workStart;

    for (const meeting of meetings) {
      const meetingStart = new Date(Math.max(meeting.start.getTime(), workStart.getTime()));
      
      if (meetingStart > currentTime) {
        const gapMinutes = (meetingStart.getTime() - currentTime.getTime()) / (1000 * 60);
        if (gapMinutes >= minSlotHours * 60) {
          return true;
        }
      }

      const meetingEnd = new Date(Math.min(meeting.end.getTime(), workEnd.getTime()));
      if (meetingEnd > currentTime) {
        currentTime = meetingEnd;
      }
    }

    const remainingMinutes = (workEnd.getTime() - currentTime.getTime()) / (1000 * 60);
    if (remainingMinutes >= minSlotHours * 60) {
      return true;
    }

    return false;
  }

  determineDayCategory(freeHours: number, hasLongFocusSlot: boolean): string {
    if (freeHours >= 6) {
      return "ФОКУСНЫЙ";
    } else if (freeHours >= 3 && hasLongFocusSlot) {
      return "ЕСТЬ ВРЕМЯ ДЛЯ ФОКУСА";
    } else {
      return "БЕЗ ФОКУСОВ, ГОСПОДИН";
    }
  }

  findImportantMeetings(events: CalendarEvent[], today: Date): { hasInternalStatus: boolean; hasProductReview: boolean } {
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const endOfWeek = this.getEndOfWorkWeek(today);
    
    let hasInternalStatus = false;
    let hasProductReview = false;

    for (const event of events) {
      const eventDate = new Date(event.start);
      
      if (eventDate >= todayStart && eventDate <= endOfWeek) {
        const summaryLower = event.summary.toLowerCase();
        
        if (summaryLower.includes("внутренний продуктовый статус")) {
          hasInternalStatus = true;
        }
        if (summaryLower.includes("product review weekly")) {
          hasProductReview = true;
        }
      }
    }
    return { hasInternalStatus, hasProductReview };
  }

  generateRecommendedTasks(dayCategory: string, hasInternalStatus: boolean, hasProductReview: boolean): string[] {
    if (dayCategory === "БЕЗ ФОКУСОВ, ГОСПОДИН") {
      return [];
    }

    const tasks: string[] = [];
    
    if (hasInternalStatus) {
      tasks.push("Подготовка к статусу с шефом");
    }
    if (hasProductReview) {
      tasks.push("Подготовка к статусу по продукту");
    }

    return tasks;
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

  analyzeDay(events: CalendarEvent[], today: Date): DayAnalysis {
    const todayMeetings = this.analyzeTodayMeetings(events, today);
    const freeHours = this.calculateFreeHours(todayMeetings, today);
    const hasLongSlot = this.hasLongFocusSlot(todayMeetings, today);
    const dayCategory = this.determineDayCategory(freeHours, hasLongSlot);
    
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const { hasInternalStatus, hasProductReview } = this.findImportantMeetings(events, todayStart);
    
    const recommendedTasks = this.generateRecommendedTasks(dayCategory, hasInternalStatus, hasProductReview);

    return {
      freeHours,
      dayCategory,
      todayMeetings,
      hasLongFocusSlot: hasLongSlot,
      recommendedTasks,
      hasInternalStatusUpcoming: hasInternalStatus,
      hasProductReviewUpcoming: hasProductReview,
    };
  }

  formatAgendaMessage(analysis: DayAnalysis, focusAreas: string[]): string {
    const lines: string[] = [
      "Доброе утро!",
      "Рекомендуемый план дня на сегодня такой, мой друг.",
      "",
      `Количество свободных часов: ${analysis.freeHours}`,
      "",
      `Тип дня: ${analysis.dayCategory}`,
    ];

    if (analysis.recommendedTasks.length > 0) {
      lines.push("");
      lines.push("Предлагаемые задачи:");
      lines.push("");
      for (const task of analysis.recommendedTasks) {
        lines.push(`- ${task}`);
      }
    }

    lines.push("");
    lines.push("Большие блоки:");
    lines.push("");
    for (const area of focusAreas) {
      lines.push(`- ${area}`);
    }

    return lines.join("\n");
  }
}
