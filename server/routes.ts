import type { Express } from "express";
import { createServer, type Server } from "http";
import { reloadConfig } from "./services/config";
import { CalDAVService } from "./services/caldav";
import { MiroService } from "./services/miro";
import { TelegramService } from "./services/telegram";
import { AgendaService } from "./services/agenda";
import type { AgendaResult } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/generate-agenda", async (req, res) => {
    const errors: string[] = [];
    let fullMessage = "";

    try {
      const config = reloadConfig();
      const agendaService = new AgendaService();
      const today = new Date();

      let weekEvents: any[] = [];
      try {
        const caldavService = new CalDAVService(config.caldav);
        weekEvents = await caldavService.fetchWeekEvents();
        console.log(`Fetched ${weekEvents.length} events from calendar`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown calendar error";
        errors.push(`Calendar: ${message}`);
      }

      let focusAreas: string[] = [];
      try {
        const miroService = new MiroService(config.miro);
        focusAreas = await miroService.getFirstLevelAreas();
        console.log(`Fetched ${focusAreas.length} focus areas from Miro`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Miro error";
        errors.push(`Miro: ${message}`);
      }

      const analysis = agendaService.analyzeDay(weekEvents, today);
      console.log(`Day analysis: ${analysis.freeHours} free hours, category: ${analysis.dayCategory}`);
      
      fullMessage = agendaService.formatAgendaMessage(analysis, focusAreas);

      let telegramSent = false;
      try {
        const telegramService = new TelegramService(config.telegram);
        telegramSent = await telegramService.sendMessage(fullMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Telegram error";
        errors.push(`Telegram: ${message}`);
      }

      const result: AgendaResult = {
        calendarSection: `Свободных часов: ${analysis.freeHours}, Тип дня: ${analysis.dayCategory}`,
        miroSection: focusAreas.join(", "),
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

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}
