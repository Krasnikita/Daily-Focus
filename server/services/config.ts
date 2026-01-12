import { readFileSync, existsSync } from "fs";
import { fileConfigSchema, type AppConfig, type FileConfig } from "@shared/schema";

let cachedConfig: AppConfig | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment secret: ${name}`);
  }
  return value;
}

function loadFileConfig(): FileConfig {
  const configPath = "./config.json";
  
  if (!existsSync(configPath)) {
    throw new Error(
      "config.json not found. Please create it with CalDAV server URL, Miro board ID, and widget ID."
    );
  }

  try {
    const configData = readFileSync(configPath, "utf-8");
    const rawConfig = JSON.parse(configData);
    
    const result = fileConfigSchema.safeParse(rawConfig);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      throw new Error(`Invalid config.json:\n${errors.join("\n")}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("config.json contains invalid JSON");
    }
    throw error;
  }
}

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const fileConfig = loadFileConfig();

  // Combine file config with environment secrets
  const caldavUsername = getRequiredEnv("CALDAV_USERNAME");
  
  // Auto-construct calendar path from username if not specified
  const calendarPath = fileConfig.caldav.calendarPath || 
    `/calendars/${caldavUsername}/events-default/`;

  cachedConfig = {
    caldav: {
      serverUrl: fileConfig.caldav.serverUrl,
      username: caldavUsername,
      password: getRequiredEnv("CALDAV_PASSWORD"),
      calendarPath: calendarPath,
    },
    miro: {
      accessToken: getRequiredEnv("MIRO_ACCESS_TOKEN"),
      boardId: fileConfig.miro.boardId,
      targetWidgetId: fileConfig.miro.targetWidgetId,
    },
    telegram: {
      botToken: getRequiredEnv("TELEGRAM_BOT_TOKEN"),
      chatId: getRequiredEnv("TELEGRAM_CHAT_ID"),
    },
  };

  return cachedConfig;
}

export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return loadConfig();
}
