import type { CalendarEvent } from "@shared/schema";

export interface TodayMeeting {
  summary: string;
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface BossPreparationData {
  conceptualThoughts: string[];
  meetingSelection: string[];
}

export interface DayAnalysis {
  freeHours: number;
  dayCategory: string;
  todayMeetings: TodayMeeting[];
  hasLongFocusSlot: boolean;
  recommendedTasks: string[];
  hasInternalStatusUpcoming: boolean;
  hasProductReviewUpcoming: boolean;
  weekContent: "подготовка питчей" | "цифры и развитие";
  bossPreparationData?: BossPreparationData;
}

const WORK_START_HOUR = 10;
const WORK_END_HOUR = 18;
const WORK_HOURS = WORK_END_HOUR - WORK_START_HOUR; // 8 hours
const BREAK_HOURS = 0.5;

export class AgendaService {
  
  getWeekContent(date: Date): "подготовка питчей" | "цифры и развитие" {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.ceil((dayOfYear + 1) / 7);
    return weekNumber % 2 === 1 ? "подготовка питчей" : "цифры и развитие";
  }
  
  analyzeTodayMeetings(events: CalendarEvent[], today: Date): TodayMeeting[] {
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayMeetings: TodayMeeting[] = [];

    for (const event of events) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Ignore full day meetings (typically 24 hours or starting at 00:00 and ending at 00:00 next day)
      const durationMs = eventEnd.getTime() - eventStart.getTime();
      const isFullDay = durationMs >= 24 * 60 * 60 * 1000 || 
                         (eventStart.getHours() === 0 && eventStart.getMinutes() === 0 && 
                          eventEnd.getHours() === 0 && eventEnd.getMinutes() === 0);
      
      if (isFullDay) {
        console.log(`Ignoring full day meeting: ${event.summary}`);
        continue;
      }

      if (eventStart >= todayStart && eventStart <= todayEnd) {
        const durationMinutes = Math.round(durationMs / (1000 * 60));
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

  getCurrentTime(): Date {
    const now = new Date();
    return new Date(now.getTime() + 3 * 60 * 60 * 1000);
  }

  calculateFreeHours(todayMeetings: TodayMeeting[], today: Date): number {
    const now = this.getCurrentTime();
    
    // Work start is max(current time, 10:00) if today, otherwise 10:00
    const workStart = new Date(today);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    
    // If current time is after 10:00 and we're calculating for today, use current time
    const isToday = now.toDateString() === today.toDateString();
    const effectiveStart = new Date(today);
    if (isToday && now > workStart) {
      effectiveStart.setTime(now.getTime());
    } else {
      effectiveStart.setHours(WORK_START_HOUR, 0, 0, 0);
    }
    
    const workEnd = new Date(today);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);
    
    // If we're already past work end, no free time
    if (effectiveStart >= workEnd) {
      return 0;
    }
    
    // Calculate available work hours from effective start to end
    const availableHours = (workEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60);

    // Merge overlapping meetings to calculate total occupied time
    const mergedMeetings: { start: number; end: number }[] = [];
    const relevantMeetings = todayMeetings
      .map(m => ({
        start: Math.max(m.start.getTime(), effectiveStart.getTime()),
        end: Math.min(m.end.getTime(), workEnd.getTime())
      }))
      .filter(m => m.start < m.end)
      .sort((a, b) => a.start - b.start);

    for (const meeting of relevantMeetings) {
      if (mergedMeetings.length === 0) {
        mergedMeetings.push(meeting);
      } else {
        const last = mergedMeetings[mergedMeetings.length - 1];
        if (meeting.start < last.end) {
          last.end = Math.max(last.end, meeting.end);
        } else {
          mergedMeetings.push(meeting);
        }
      }
    }

    const meetingMinutes = mergedMeetings.reduce((sum, m) => sum + (m.end - m.start) / (1000 * 60), 0);
    const meetingHours = meetingMinutes / 60;
    const freeHours = availableHours - BREAK_HOURS - meetingHours;

    return Math.max(0, Math.round(freeHours * 10) / 10);
  }

  hasLongFocusSlot(todayMeetings: TodayMeeting[], today: Date, minSlotHours: number = 2): boolean {
    const now = this.getCurrentTime();
    
    const workStart = new Date(today);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    
    // Use current time if after 10:00 and calculating for today
    const isToday = now.toDateString() === today.toDateString();
    const effectiveStart = new Date(today);
    if (isToday && now > workStart) {
      effectiveStart.setTime(now.getTime());
    } else {
      effectiveStart.setHours(WORK_START_HOUR, 0, 0, 0);
    }
    
    const workEnd = new Date(today);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);
    
    if (effectiveStart >= workEnd) {
      return false;
    }

    const meetings = todayMeetings
      .filter(m => m.start < workEnd && m.end > effectiveStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (meetings.length === 0) {
      return true;
    }

    let currentTime = effectiveStart;

    for (const meeting of meetings) {
      const meetingStart = new Date(Math.max(meeting.start.getTime(), effectiveStart.getTime()));
      
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

  findImportantMeetings(events: CalendarEvent[]): { hasInternalStatus: boolean; hasProductReview: boolean } {
    let hasInternalStatus = false;
    let hasProductReview = false;

    // Events should be filtered by CalDAV to only include today onwards
    // This ensures past meetings don't trigger preparation tasks
    for (const event of events) {
      const summaryLower = event.summary.toLowerCase();
      
      if (summaryLower.includes("внутренний продуктовый статус")) {
        hasInternalStatus = true;
      }
      if (summaryLower.includes("product review weekly")) {
        hasProductReview = true;
      }
    }
    
    console.log(`Important meetings found (from today onwards): internal=${hasInternalStatus}, productReview=${hasProductReview}`);
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

  analyzeDay(events: CalendarEvent[], today: Date, bossPreparationData?: BossPreparationData, upcomingEvents?: CalendarEvent[]): DayAnalysis {
    const todayMeetings = this.analyzeTodayMeetings(events, today);
    const freeHours = this.calculateFreeHours(todayMeetings, today);
    const hasLongSlot = this.hasLongFocusSlot(todayMeetings, today);
    const dayCategory = this.determineDayCategory(freeHours, hasLongSlot);
    
    // Use upcomingEvents (from today onwards) to check for important meetings
    // This ensures past meetings within the week don't trigger preparation tasks
    const eventsToCheck = upcomingEvents || events;
    const { hasInternalStatus, hasProductReview } = this.findImportantMeetings(eventsToCheck);
    
    const recommendedTasks = this.generateRecommendedTasks(dayCategory, hasInternalStatus, hasProductReview);
    const weekContent = this.getWeekContent(today);

    return {
      freeHours,
      dayCategory,
      todayMeetings,
      hasLongFocusSlot: hasLongSlot,
      recommendedTasks,
      hasInternalStatusUpcoming: hasInternalStatus,
      hasProductReviewUpcoming: hasProductReview,
      weekContent,
      bossPreparationData,
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

    if (analysis.hasInternalStatusUpcoming || analysis.hasProductReviewUpcoming) {
      lines.push("");
      lines.push("Предлагаемые задачи:");
      lines.push("");
      
      let taskCounter = 1;

      if (analysis.hasInternalStatusUpcoming) {
        lines.push(`${taskCounter++}. Подготовка к статусу с шефом`);
        lines.push("");
        lines.push(`— Содержание: ${analysis.weekContent}`);
        lines.push("");
        
        if (analysis.bossPreparationData) {
          if (analysis.bossPreparationData.conceptualThoughts.length > 0) {
            lines.push("— Концептуальные мысли:");
            for (const thought of analysis.bossPreparationData.conceptualThoughts) {
              lines.push(`—— ${thought}`);
            }
            lines.push("");
          }
          
          if (analysis.bossPreparationData.meetingSelection.length > 0) {
            lines.push("— Отбор на ближайшую встречу:");
            for (const item of analysis.bossPreparationData.meetingSelection) {
              lines.push(`—— ${item}`);
            }
            lines.push("");
          }
        }
      }
      
      if (analysis.hasProductReviewUpcoming) {
        lines.push(`${taskCounter++}. Подготовка к статусу по продукту`);
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
