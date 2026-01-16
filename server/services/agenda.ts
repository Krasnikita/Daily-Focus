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
  hasSalesStatusUpcoming: boolean;
  weekContent: "подготовка питчей" | "цифры и развитие";
  bossPreparationData?: BossPreparationData;
}

// Moscow time work hours: 10:00 - 18:00 MSK = 07:00 - 15:00 UTC
const WORK_START_HOUR_UTC = 7;
const WORK_END_HOUR_UTC = 15;
const MOSCOW_OFFSET_HOURS = 3;
const WORK_HOURS = 8; // 10:00-18:00 = 8 hours
const BREAK_HOURS = 0.5;

export class AgendaService {
  
  getWeekContent(date: Date): "подготовка питчей" | "цифры и развитие" {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.ceil((dayOfYear + 1) / 7);
    return weekNumber % 2 === 1 ? "подготовка питчей" : "цифры и развитие";
  }
  
  analyzeTodayMeetings(events: CalendarEvent[], today: Date): TodayMeeting[] {
    // CalDAV already filtered events by today's date range
    // But recurring events return original DTSTART - need to map time to today
    console.log(`Analyzing ${events.length} events from CalDAV for today`);

    const todayMeetings: TodayMeeting[] = [];
    
    // Get today's date in UTC
    const todayDate = new Date(today);
    todayDate.setUTCHours(0, 0, 0, 0);

    for (const event of events) {
      const originalStart = new Date(event.start);
      const originalEnd = new Date(event.end);

      // Ignore full day meetings
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const isFullDay = durationMs >= 24 * 60 * 60 * 1000 || 
                         (originalStart.getUTCHours() === 0 && originalStart.getUTCMinutes() === 0 && 
                          originalEnd.getUTCHours() === 0 && originalEnd.getUTCMinutes() === 0);
      
      if (isFullDay) {
        console.log(`Ignoring full day meeting: ${event.summary}`);
        continue;
      }

      // For recurring events, map the time-of-day to today's date
      // This handles cases where CalDAV returns original DTSTART for recurring events
      const eventStart = new Date(todayDate);
      eventStart.setUTCHours(originalStart.getUTCHours(), originalStart.getUTCMinutes(), 0, 0);
      
      const eventEnd = new Date(todayDate);
      eventEnd.setUTCHours(originalEnd.getUTCHours(), originalEnd.getUTCMinutes(), 0, 0);
      
      // If end time is before start (shouldn't happen normally), add a day
      if (eventEnd <= eventStart) {
        eventEnd.setUTCDate(eventEnd.getUTCDate() + 1);
      }

      const durationMinutes = Math.round((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60));
      todayMeetings.push({
        summary: event.summary,
        start: eventStart,
        end: eventEnd,
        durationMinutes,
      });
      console.log(`  Today meeting: ${event.summary} at ${eventStart.toISOString()} (${durationMinutes}min)`);
    }

    console.log(`Found ${todayMeetings.length} meetings for today`);
    return todayMeetings.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // Get current time in UTC (server time is UTC)
  getCurrentTimeUTC(): Date {
    return new Date();
  }

  calculateFreeHours(todayMeetings: TodayMeeting[], today: Date): number {
    const now = this.getCurrentTimeUTC();
    
    // Work hours in UTC: 07:00-15:00 UTC = 10:00-18:00 Moscow
    const workStart = new Date(today);
    workStart.setUTCHours(WORK_START_HOUR_UTC, 0, 0, 0);
    
    const workEnd = new Date(today);
    workEnd.setUTCHours(WORK_END_HOUR_UTC, 0, 0, 0);
    
    // Check if we're on the same day (in UTC)
    const isToday = now.toDateString() === today.toDateString();
    
    // Effective start is max(current time, work start) if today
    let effectiveStart: Date;
    if (isToday && now > workStart) {
      effectiveStart = new Date(now);
    } else {
      effectiveStart = new Date(workStart);
    }
    
    // If we're already past work end, no free time
    if (effectiveStart >= workEnd) {
      return 0;
    }
    
    // Calculate available work hours from effective start to end
    const availableHours = (workEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60);

    // Merge overlapping meetings that fall within work hours
    const mergedMeetings: { start: number; end: number }[] = [];
    const relevantMeetings = todayMeetings
      .map(m => ({
        start: Math.max(m.start.getTime(), effectiveStart.getTime()),
        end: Math.min(m.end.getTime(), workEnd.getTime())
      }))
      .filter(m => m.start < m.end)
      .sort((a, b) => a.start - b.start);

    console.log(`Today meetings (${todayMeetings.length} total), ${relevantMeetings.length} relevant for free hours calc`);
    todayMeetings.forEach(m => {
      const startUTC = m.start.toISOString();
      const endUTC = m.end.toISOString();
      console.log(`  - ${m.summary}: ${startUTC} to ${endUTC} (${m.durationMinutes}min)`);
    });

    for (const meeting of relevantMeetings) {
      if (mergedMeetings.length === 0) {
        mergedMeetings.push(meeting);
      } else {
        const last = mergedMeetings[mergedMeetings.length - 1];
        if (meeting.start <= last.end) {
          last.end = Math.max(last.end, meeting.end);
        } else {
          mergedMeetings.push(meeting);
        }
      }
    }

    const meetingMinutes = mergedMeetings.reduce((sum, m) => sum + (m.end - m.start) / (1000 * 60), 0);
    const meetingHours = meetingMinutes / 60;
    const freeHours = availableHours - BREAK_HOURS - meetingHours;

    console.log(`Free hours calc: effectiveStart=${effectiveStart.toISOString()}, workEnd=${workEnd.toISOString()}`);
    console.log(`Free hours calc: available=${availableHours.toFixed(1)}, meetings=${meetingHours.toFixed(1)}h, break=${BREAK_HOURS}, free=${freeHours.toFixed(1)}`);

    return Math.max(0, Math.round(freeHours * 10) / 10);
  }

  hasLongFocusSlot(todayMeetings: TodayMeeting[], today: Date, minSlotHours: number = 2): boolean {
    const now = this.getCurrentTimeUTC();
    
    // Work hours in UTC: 07:00-15:00 UTC = 10:00-18:00 Moscow
    const workStart = new Date(today);
    workStart.setUTCHours(WORK_START_HOUR_UTC, 0, 0, 0);
    
    const workEnd = new Date(today);
    workEnd.setUTCHours(WORK_END_HOUR_UTC, 0, 0, 0);
    
    // Check if we're on the same day (in UTC)
    const isToday = now.toDateString() === today.toDateString();
    
    let effectiveStart: Date;
    if (isToday && now > workStart) {
      effectiveStart = new Date(now);
    } else {
      effectiveStart = new Date(workStart);
    }
    
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

  findImportantMeetings(events: CalendarEvent[]): { hasInternalStatus: boolean; hasProductReview: boolean; hasSalesStatus: boolean } {
    let hasInternalStatus = false;
    let hasProductReview = false;
    let hasSalesStatus = false;

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
      if (summaryLower.includes("заемщики: результаты, действия, run задачи")) {
        hasSalesStatus = true;
      }
    }
    
    console.log(`Important meetings found (from today onwards): internal=${hasInternalStatus}, productReview=${hasProductReview}, sales=${hasSalesStatus}`);
    return { hasInternalStatus, hasProductReview, hasSalesStatus };
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
    const { hasInternalStatus, hasProductReview, hasSalesStatus } = this.findImportantMeetings(eventsToCheck);
    
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
      hasSalesStatusUpcoming: hasSalesStatus,
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

    const hasAnyTasks = analysis.hasInternalStatusUpcoming || analysis.hasProductReviewUpcoming || analysis.hasSalesStatusUpcoming;

    if (hasAnyTasks) {
      lines.push("");
      lines.push("Предлагаемые задачи:");
      lines.push("");
      
      let taskCounter = 1;

      if (analysis.hasSalesStatusUpcoming) {
        lines.push(`${taskCounter++}. Подготовка к статусу по sales:`);
        lines.push("");
        lines.push("- Подготовить анализ продуктовых метрик по активности пользователей");
        lines.push("- Освежить действия по основным сейлз-векторам");
        lines.push("- Постепенно передавать Ане, меньше участвовать, или лидить, но не брать на себя кучу пойнтов");
        lines.push("");
      }

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

    // Filter out "Профессиональное развитие" from focus areas
    const filteredFocusAreas = focusAreas.filter(area => area !== "Профессиональное развитие");

    lines.push("");
    lines.push("Большие блоки:");
    lines.push("");
    for (const area of filteredFocusAreas) {
      lines.push(`- ${area}`);
    }

    return lines.join("\n");
  }
}
