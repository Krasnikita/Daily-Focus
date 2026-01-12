import { readFileSync, existsSync } from "fs";
import { configSchema, type AppConfig } from "@shared/schema";

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = "./config.json";
  
  if (!existsSync(configPath)) {
    throw new Error(
      "config.json not found. Please create it with your CalDAV, Miro, and Telegram credentials."
    );
  }

  try {
    const configData = readFileSync(configPath, "utf-8");
    const rawConfig = JSON.parse(configData);
    
    const result = configSchema.safeParse(rawConfig);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      throw new Error(`Invalid config.json:\n${errors.join("\n")}`);
    }

    cachedConfig = result.data;
    return cachedConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("config.json contains invalid JSON");
    }
    throw error;
  }
}

export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return loadConfig();
}
