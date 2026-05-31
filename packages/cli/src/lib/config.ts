import { join } from "path";
import { homedir } from "os";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const CONFIG_DIR = join(homedir(), ".litecode");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export type Config = {
  anthropicApiKey?: string;
  openaiApiKey?: string;
};

export async function loadConfig(): Promise<Config> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    return {};
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function applyConfigToEnv(config: Config): void {
  if (config.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
  }
  if (config.openaiApiKey) {
    process.env.OPENAI_API_KEY = config.openaiApiKey;
  }
}
