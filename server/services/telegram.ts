import fetch from "node-fetch";
import type { AppConfig } from "@shared/schema";

export class TelegramService {
  private config: AppConfig["telegram"];
  private baseUrl: string;

  constructor(config: AppConfig["telegram"]) {
    this.config = config;
    this.baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;
  }

  async sendMessage(text: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: text,
          parse_mode: "HTML",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { description?: string };
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
      }

      const result = await response.json() as { ok: boolean };
      return result.ok;
    } catch (error) {
      console.error("Telegram error:", error);
      throw new Error(`Ошибка отправки в Telegram: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      const result = await response.json() as { ok: boolean };
      return result.ok;
    } catch (error) {
      return false;
    }
  }
}
