import fetch from "node-fetch";
import type { AppConfig } from "@shared/schema";
import { CalDAVService } from "./caldav";
import { MiroService } from "./miro";
import { AgendaService } from "./agenda";
import { TelegramService } from "./telegram";
import { reloadConfig } from "./config";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  };
}

interface TelegramResponse {
  ok: boolean;
  result?: TelegramUpdate[];
}

export class TelegramBotService {
  private config: AppConfig["telegram"];
  private baseUrl: string;
  private lastUpdateId: number = 0;
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private activeProcesses: Map<number, AbortController> = new Map();

  constructor(config: AppConfig["telegram"]) {
    this.config = config;
    this.baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("Telegram bot polling started");
    
    await this.sendStartMessage();
    this.poll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.activeProcesses.forEach((controller) => controller.abort());
    this.activeProcesses.clear();
    console.log("Telegram bot polling stopped");
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const updates = await this.getUpdates();
      for (const update of updates) {
        await this.handleUpdate(update);
        this.lastUpdateId = update.update_id + 1;
      }
    } catch (error) {
      console.error("Polling error:", error);
    }

    this.pollingInterval = setTimeout(() => this.poll(), 2000);
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/getUpdates?offset=${this.lastUpdateId}&timeout=30`
      );
      const data = (await response.json()) as TelegramResponse;
      return data.ok ? data.result || [] : [];
    } catch (error) {
      console.error("getUpdates error:", error);
      return [];
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    } else if (update.message?.text === "/start") {
      await this.sendStartMessage(update.message.chat.id);
    }
  }

  private async handleCallbackQuery(query: TelegramUpdate["callback_query"]): Promise<void> {
    if (!query || query.data !== "run_parser") return;

    const chatId = query.message?.chat.id || parseInt(this.config.chatId);
    
    await this.answerCallbackQuery(query.id, "Запускаю парсер...");
    await this.sendMessage(chatId, "Запускаю анализ расписания. Это может занять до 2 минут...");

    const abortController = new AbortController();
    this.activeProcesses.set(chatId, abortController);

    const timeoutId = setTimeout(async () => {
      if (this.activeProcesses.has(chatId)) {
        abortController.abort();
        this.activeProcesses.delete(chatId);
        await this.sendMessage(chatId, "Ошибка процесса. Нужно попробовать еще раз");
        await this.sendStartMessage(chatId);
        console.log("Parser process timed out after 10 minutes");
      }
    }, 10 * 60 * 1000);

    try {
      const result = await this.runParser(abortController.signal);
      
      clearTimeout(timeoutId);
      this.activeProcesses.delete(chatId);

      if (result.success) {
        await this.sendMessage(chatId, result.message);
      } else {
        await this.sendMessage(chatId, `Ошибка: ${result.error}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      this.activeProcesses.delete(chatId);

      if ((error as Error).name !== "AbortError") {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await this.sendMessage(chatId, `Ошибка: ${errorMsg}`);
      }
    }

    await this.sendStartMessage(chatId);
  }

  private async runParser(signal: AbortSignal): Promise<{ success: boolean; message: string; error?: string }> {
    if (signal.aborted) {
      throw new Error("AbortError");
    }

    const errors: string[] = [];
    const config = reloadConfig();
    const agendaService = new AgendaService();
    const today = new Date();

    let todayEvents: any[] = [];
    let upcomingEvents: any[] = [];
    try {
      const caldavService = new CalDAVService(config.caldav);
      todayEvents = await caldavService.fetchTodayEvents();
      upcomingEvents = await caldavService.fetchEventsFromTodayOnwards();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown calendar error";
      errors.push(`Calendar: ${message}`);
    }

    if (signal.aborted) throw new Error("AbortError");

    let focusAreas: string[] = [];
    let bossPreparationData: { conceptualThoughts: string[]; meetingSelection: string[] } | undefined;
    try {
      const miroService = new MiroService(config.miro);
      focusAreas = await miroService.getFirstLevelAreas();
      bossPreparationData = await miroService.getBossPreparationItems();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Miro error";
      errors.push(`Miro: ${message}`);
    }

    if (signal.aborted) throw new Error("AbortError");

    const analysis = agendaService.analyzeDay(todayEvents, today, bossPreparationData, upcomingEvents);
    const fullMessage = agendaService.formatAgendaMessage(analysis, focusAreas);

    if (errors.length > 0) {
      return {
        success: false,
        message: fullMessage,
        error: errors.join("; "),
      };
    }

    return {
      success: true,
      message: fullMessage,
    };
  }

  private async sendStartMessage(chatId?: number): Promise<void> {
    const targetChatId = chatId || parseInt(this.config.chatId);
    
    const keyboard = {
      inline_keyboard: [
        [{ text: "Запустить", callback_data: "run_parser" }]
      ]
    };

    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: "Нажмите кнопку для запуска анализа расписания:",
          reply_markup: keyboard,
        }),
      });
    } catch (error) {
      console.error("Failed to send start message:", error);
    }
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML",
        }),
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }

  private async answerCallbackQuery(queryId: string, text: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: queryId,
          text: text,
        }),
      });
    } catch (error) {
      console.error("Failed to answer callback query:", error);
    }
  }
}

let botInstance: TelegramBotService | null = null;

export function startTelegramBot(config: AppConfig["telegram"]): TelegramBotService {
  if (botInstance) {
    botInstance.stop();
  }
  botInstance = new TelegramBotService(config);
  botInstance.start();
  return botInstance;
}

export function stopTelegramBot(): void {
  if (botInstance) {
    botInstance.stop();
    botInstance = null;
  }
}
