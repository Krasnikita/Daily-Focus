import { z } from "zod";

// Configuration schema
export const configSchema = z.object({
  caldav: z.object({
    serverUrl: z.string().url(),
    username: z.string(),
    password: z.string(),
    calendarPath: z.string().optional(),
  }),
  miro: z.object({
    accessToken: z.string(),
    boardId: z.string(),
    targetWidgetId: z.string(), // ID of "Ключевые векторы" widget
  }),
  telegram: z.object({
    botToken: z.string(),
    chatId: z.string(),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

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
  level: number;
  children: MindmapNode[];
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
