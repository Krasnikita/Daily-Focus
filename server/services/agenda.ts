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
  hasGroomingUpcoming: boolean;
  weekContent: "подготовка питчей" | "цифры и развитие";
  bossPreparationData?: BossPreparationData;
}

// CalDAV returns times in Moscow timezone but with UTC suffix (Z)
// So we compare against Moscow work hours directly: 10:00 - 18:00
const WORK_START_HOUR = 10;
const WORK_END_HOUR = 18;
const WORK_HOURS = 8; // 10:00-18:00 = 8 hours
const BREAK_HOURS = 0.5;

export class AgendaService {
  
  getWeekContent(date: Date): "подготовка питчей" | "цифры и развитие" {
    // Normalize date to Moscow fake UTC for consistent week calculation
    const moscowDate = this.toMoscowDayStart(date);
    const startOfYear = new Date(Date.UTC(moscowDate.getUTCFullYear(), 0, 1));
    const dayOfYear = Math.floor((moscowDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.ceil((dayOfYear + 1) / 7);
    return weekNumber % 2 === 1 ? "подготовка питчей" : "цифры и развитие";
  }
  
  analyzeTodayMeetings(events: CalendarEvent[], today: Date): TodayMeeting[] {
    // CalDAV already filtered events by today's date range
    // But recurring events return original DTSTART - need to map time to today
    console.log(`Analyzing ${events.length} events from CalDAV for today`);

    const todayMeetings: TodayMeeting[] = [];
    
    // Convert today to Moscow day start for consistent matching with CalDAV meeting times
    const todayDate = this.toMoscowDayStart(today);

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

  // Convert any UTC date to "fake UTC" (Moscow time with Z suffix) to match CalDAV format
  // CalDAV returns Moscow times labeled as UTC, so we need to compare apples to apples
  private toMoscowFakeUTC(date: Date): Date {
    const moscow = new Date(date);
    moscow.setUTCHours(moscow.getUTCHours() + 3);
    return moscow;
  }

  // Get current time as "fake UTC" (Moscow time)
  getCurrentTimeAsMoscowFakeUTC(): Date {
    return this.toMoscowFakeUTC(new Date());
  }

  // Get today's date at midnight in "fake UTC" (Moscow time)
  getTodayMoscowFakeUTC(): Date {
    const now = this.getCurrentTimeAsMoscowFakeUTC();
    now.setUTCHours(0, 0, 0, 0);
    return now;
  }

  // Convert any date to Moscow day start (midnight in Moscow fake UTC)
  // Use this for all day-level comparisons to ensure consistency
  toMoscowDayStart(date: Date): Date {
    const moscow = this.toMoscowFakeUTC(date);
    moscow.setUTCHours(0, 0, 0, 0);
    return moscow;
  }

  // Get the previous work day (Friday -> Thursday, Monday -> Friday, etc.)
  private getPreviousWorkDay(date: Date): Date {
    const prev = new Date(date);
    const dayOfWeek = prev.getUTCDay();
    
    if (dayOfWeek === 1) {
      // Monday -> previous work day is Friday (3 days back)
      prev.setUTCDate(prev.getUTCDate() - 3);
    } else if (dayOfWeek === 0) {
      // Sunday -> previous work day is Friday (2 days back)
      prev.setUTCDate(prev.getUTCDate() - 2);
    } else {
      // Other days -> just go back 1 day
      prev.setUTCDate(prev.getUTCDate() - 1);
    }
    
    return prev;
  }

  calculateFreeHours(todayMeetings: TodayMeeting[], today: Date): number {
    const now = this.getCurrentTimeAsMoscowFakeUTC();
    // Convert today to Moscow day start for consistent comparison
    const todayMoscowDayStart = this.toMoscowDayStart(today);
    
    // CalDAV returns Moscow times with UTC suffix, so compare against Moscow work hours directly
    const workStart = new Date(todayMoscowDayStart);
    workStart.setUTCHours(WORK_START_HOUR, 0, 0, 0);
    
    const workEnd = new Date(todayMoscowDayStart);
    workEnd.setUTCHours(WORK_END_HOUR, 0, 0, 0);
    
    // Check if we're on the same day using the unified helper
    const nowDayStart = this.getTodayMoscowFakeUTC();
    const isToday = this.isSameDay(nowDayStart, todayMoscowDayStart);
    
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
    const now = this.getCurrentTimeAsMoscowFakeUTC();
    // Convert today to Moscow day start for consistent comparison
    const todayMoscowDayStart = this.toMoscowDayStart(today);
    
    // CalDAV returns Moscow times with UTC suffix, so compare against Moscow work hours directly
    const workStart = new Date(todayMoscowDayStart);
    workStart.setUTCHours(WORK_START_HOUR, 0, 0, 0);
    
    const workEnd = new Date(todayMoscowDayStart);
    workEnd.setUTCHours(WORK_END_HOUR, 0, 0, 0);
    
    // Check if we're on the same day using the unified helper
    const nowDayStart = this.getTodayMoscowFakeUTC();
    const isToday = this.isSameDay(nowDayStart, todayMoscowDayStart);
    
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

  private getNextWorkDay(date: Date): Date {
    const next = new Date(date);
    const dayOfWeek = next.getUTCDay();
    
    if (dayOfWeek === 5) {
      // Friday -> next work day is Monday (3 days forward)
      next.setUTCDate(next.getUTCDate() + 3);
    } else if (dayOfWeek === 6) {
      // Saturday -> next work day is Monday (2 days forward)
      next.setUTCDate(next.getUTCDate() + 2);
    } else {
      // Other days -> just go forward 1 day
      next.setUTCDate(next.getUTCDate() + 1);
    }
    
    return next;
  }

  // Compare two dates using UTC components (for fake UTC / Moscow time comparisons)
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getUTCFullYear() === date2.getUTCFullYear() &&
           date1.getUTCMonth() === date2.getUTCMonth() &&
           date1.getUTCDate() === date2.getUTCDate();
  }

  findImportantMeetings(events: CalendarEvent[], today: Date, todayMeetings?: TodayMeeting[]): { hasInternalStatus: boolean; hasProductReview: boolean; hasSalesStatus: boolean; hasGrooming: boolean } {
    let hasInternalStatus = false;
    let hasProductReview = false;
    let hasSalesStatus = false;
    let hasGrooming = false;

    // Normalize today and tomorrow to Moscow day start for consistent comparison
    const todayNormalized = this.toMoscowDayStart(today);
    const tomorrowNormalized = new Date(todayNormalized);
    tomorrowNormalized.setUTCDate(tomorrowNormalized.getUTCDate() + 1);

    // Check for meetings in the upcoming events list
    for (const event of events) {
      const summaryLower = event.summary.toLowerCase();
      
      if (summaryLower.includes("внутренний продуктовый статус")) {
        hasInternalStatus = true;
      }
      if (summaryLower.includes("product review weekly")) {
        hasProductReview = true;
      }
      
      // Check for ORD1 grooming meeting - today or tomorrow
      // Note: Event dates from CalDAV are already in Moscow "fake UTC", so we just normalize to day start
      if (summaryLower.includes("ord1") && summaryLower.includes("груминг")) {
        const eventDate = new Date(event.start);
        eventDate.setUTCHours(0, 0, 0, 0);  // Already in Moscow timezone, just set to midnight
        if (this.isSameDay(eventDate, todayNormalized) || this.isSameDay(eventDate, tomorrowNormalized)) {
          hasGrooming = true;
        }
      }
    }

    // Also check todayMeetings for grooming and sales meetings (handles recurring events with date-mapped times)
    if (todayMeetings) {
      for (const meeting of todayMeetings) {
        const summaryLower = meeting.summary.toLowerCase();
        if (summaryLower.includes("ord1") && summaryLower.includes("груминг")) {
          hasGrooming = true;
        }
        if (summaryLower.includes("заемщики:")) {
          hasSalesStatus = true;
        }
      }
    }

    // Check for "Заемщики:" meeting - show prep if:
    // 1. Meeting is today (checked above via todayMeetings), OR
    // 2. Today is 1 work day before the meeting (e.g., Friday for Monday meeting)
    // Re-use todayNormalized from above for consistency
    
    // Check events list for "Заемщики:" meeting
    for (const event of events) {
      const summaryLower = event.summary.toLowerCase();
      if (summaryLower.includes("заемщики:")) {
        // Event dates from CalDAV are already in Moscow "fake UTC", normalize to day start
        const eventDate = new Date(event.start);
        eventDate.setUTCHours(0, 0, 0, 0);
        
        // Show prep if meeting is today
        if (this.isSameDay(eventDate, todayNormalized)) {
          hasSalesStatus = true;
        } else {
          // Check if today is 1 work day before the meeting
          const previousWorkDay = this.getPreviousWorkDay(eventDate);
          previousWorkDay.setUTCHours(0, 0, 0, 0);
          if (this.isSameDay(todayNormalized, previousWorkDay)) {
            hasSalesStatus = true;
          }
        }
      }
    }
    
    // Fallback for recurring meetings: if today is Friday, also check if meeting exists
    // (handles recurring meetings that might not show specific dates in events list)
    const dayOfWeek = todayNormalized.getUTCDay();
    if (dayOfWeek === 5 && !hasSalesStatus) {
      for (const event of events) {
        const summaryLower = event.summary.toLowerCase();
        if (summaryLower.includes("заемщики:")) {
          hasSalesStatus = true;
          break;
        }
      }
    }
    
    console.log(`Important meetings: internal=${hasInternalStatus}, productReview=${hasProductReview}, sales=${hasSalesStatus}, grooming=${hasGrooming}`);
    return { hasInternalStatus, hasProductReview, hasSalesStatus, hasGrooming };
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
    const dayOfWeek = d.getUTCDay();
    let daysUntilFriday: number;
    
    if (dayOfWeek === 0) {
      daysUntilFriday = 5;
    } else if (dayOfWeek === 6) {
      daysUntilFriday = 6;
    } else {
      daysUntilFriday = 5 - dayOfWeek;
    }
    
    d.setUTCDate(d.getUTCDate() + daysUntilFriday);
    d.setUTCHours(23, 59, 59, 999);
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
    const { hasInternalStatus, hasProductReview, hasSalesStatus, hasGrooming } = this.findImportantMeetings(eventsToCheck, today, todayMeetings);
    
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
      hasGroomingUpcoming: hasGrooming,
      weekContent,
      bossPreparationData,
    };
  }

  formatAgendaMessage(analysis: DayAnalysis, focusAreas: string[], statusItems?: Array<{ category: string; items: Array<{ name: string; subItems: string[] }> }>, disadvantages?: string[]): string {
    const lines: string[] = [
      "Доброе утро!",
      "Рекомендуемый план дня на сегодня такой, мой друг.",
      "",
      `Количество свободных часов: ${analysis.freeHours}`,
      "",
      `Тип дня: ${analysis.dayCategory}`,
    ];

    const hasAnyTasks = analysis.hasInternalStatusUpcoming || analysis.hasProductReviewUpcoming || analysis.hasSalesStatusUpcoming || analysis.hasGroomingUpcoming;

    if (hasAnyTasks) {
      lines.push("");
      lines.push("ПРЕДЛАГАЕМЫЕ ЗАДАЧИ:");
      lines.push("");
      
      let taskCounter = 1;

      if (analysis.hasSalesStatusUpcoming) {
        lines.push(`${taskCounter++}. Подготовка к статусу по sales operations`);
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
        lines.push("");
      }

      if (analysis.hasGroomingUpcoming) {
        lines.push(`${taskCounter++}. Подготовить задачи или проекты к грумингу`);
        lines.push("");
        lines.push("— Проверить фокусные проекты");
        lines.push("— Проверить фильтр с run-задачами");
        lines.push("— Проверить, нужно ли предварительно грумить идеи проектов");
        lines.push("");
      }
    }

    // Filter out "Профессиональное развитие" from focus areas
    const filteredFocusAreas = focusAreas.filter(area => area !== "Профессиональное развитие");

    lines.push("");
    lines.push("БОЛЬШИЕ БЛОКИ:");
    lines.push("");
    for (const area of filteredFocusAreas) {
      lines.push(`- ${area}`);
    }

    // Add status items section if available
    if (statusItems && statusItems.length > 0) {
      lines.push("");
      lines.push("ПУНКТЫ СО СТАТУСА:");
      lines.push("");
      for (const category of statusItems) {
        lines.push(category.category);
        for (const item of category.items) {
          lines.push(`- ${item.name}`);
          item.subItems.forEach((subItem, index) => {
            lines.push(`${index + 1}. ${subItem}`);
          });
        }
        lines.push("");
      }
    }

    if (disadvantages && disadvantages.length > 0) {
      lines.push("");
      lines.push("УБИРАТЬ НЕДОСТАТКИ:");
      lines.push("");
      for (const item of disadvantages) {
        lines.push(`- ${item}`);
      }
    }

    return lines.join("\n");
  }
}
