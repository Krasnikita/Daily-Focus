import { z } from "zod";

// File-based config schema (non-sensitive settings only)
export const fileConfigSchema = z.object({
  caldav: z.object({
    serverUrl: z.string().url(),
    calendarPath: z.string().optional(),
  }),
  miro: z.object({
    boardId: z.string(),
    targetWidgetId: z.string(),
  }),
});

export type FileConfig = z.infer<typeof fileConfigSchema>;

// Full config type (file config + secrets from environment)
export interface AppConfig {
  caldav: {
    serverUrl: string;
    username: string;
    password: string;
    calendarPath?: string;
  };
  miro: {
    accessToken: string;
    boardId: string;
    targetWidgetId: string;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
}

// Calendar event
export interface CalendarEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  description?: string;
}

// Miro shape item
export interface MiroShapeItem {
  id: string;
  type: string;
  content: string;
  parentId?: string;
  position: {
    x: number;
    y: number;
  };
}

// Miro connector (line between items)
export interface MiroConnector {
  id: string;
  startItem?: { id: string };
  endItem?: { id: string };
}

// Parsed mindmap node
export interface MindmapNode {
  id: string;
  content: string;
  parentId?: string;
  isRoot?: boolean;
}

// Agenda output
export interface AgendaResult {
  calendarSection: string;
  miroSection: string;
  fullMessage: string;
  success: boolean;
  errors?: string[];
}

// Russian day names for output
export const RUSSIAN_DAYS: Record<number, string> = {
  0: "Воскресенье",
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
};
