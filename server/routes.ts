import type { Express } from "express";
import { createServer, type Server } from "http";
import { loadConfig, reloadConfig } from "./services/config";
import { CalDAVService } from "./services/caldav";
import { MiroService } from "./services/miro";
import { TelegramService } from "./services/telegram";
import type { AgendaResult } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Generate agenda endpoint
  app.post("/api/generate-agenda", async (req, res) => {
    const errors: string[] = [];
    let calendarSection = "";
    let miroSection = "";

    try {
      // Reload config to pick up any changes
      const config = reloadConfig();

      // Fetch calendar data
      try {
        const caldavService = new CalDAVService(config.caldav);
        calendarSection = await caldavService.findProductReviewMeeting();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown calendar error";
        errors.push(`Calendar: ${message}`);
        calendarSection = "На этой неделе:\nОшибка получения календаря";
      }

      // Fetch Miro data
      try {
        const miroService = new MiroService(config.miro);
        miroSection = await miroService.formatMiroSection();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Miro error";
        errors.push(`Miro: ${message}`);
        miroSection = "Фокус на:\nОшибка получения данных из Miro";
      }

      // Combine into full message
      const fullMessage = `${calendarSection}\n\n${miroSection}`;

      // Send to Telegram
      let telegramSent = false;
      try {
        const telegramService = new TelegramService(config.telegram);
        telegramSent = await telegramService.sendMessage(fullMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Telegram error";
        errors.push(`Telegram: ${message}`);
      }

      const result: AgendaResult = {
        calendarSection,
        miroSection,
        fullMessage,
        success: errors.length === 0 && telegramSent,
        errors: errors.length > 0 ? errors : undefined,
      };

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        success: false,
        error: message,
        calendarSection: "",
        miroSection: "",
        fullMessage: "",
        errors: [message],
      });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}
