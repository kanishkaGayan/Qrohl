import fs from "node:fs/promises";
import path from "node:path";

function resolveLogFilePath(): string {
  const fromEnv = process.env.APP_LOG_FILE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return path.join(process.cwd(), ".qrohl-errors.log");
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join(" | ");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function writeServerLog(scope: string, message: string, error?: unknown): Promise<void> {
  const logFile = resolveLogFilePath();
  const logDir = path.dirname(logFile);
  const timestamp = new Date().toISOString();
  const serializedError = error ? ` | error=${stringifyError(error)}` : "";
  const line = `[${timestamp}] [${scope}] ${message}${serializedError}\n`;

  try {
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, line, "utf8");
  } catch {
    console.error(`[Qrohl][${scope}] ${message}`, error);
  }
}
