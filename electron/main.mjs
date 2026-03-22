import { app, BrowserWindow, Menu } from "electron";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.commandLine.appendSwitch("lang", "en-US");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.disableHardwareAcceleration();

const isDev = !app.isPackaged;
const configuredPort = Number(process.env.PORT || "3000");
let runtimePort = configuredPort;

let mainWindow = null;
let nextProcess = null;

async function appendRuntimeLog(message, error = null) {
  try {
    const logFile = process.env.APP_LOG_FILE;
    if (!logFile) {
      return;
    }

    const logDir = path.dirname(logFile);
    await fs.mkdir(logDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const details = error ? ` | ${error?.stack ?? String(error)}` : "";
    await fs.appendFile(logFile, `[${timestamp}] [electron-main] ${message}${details}\n`, "utf8");
  } catch {
    // no-op
  }
}

function getAppUrl() {
  return process.env.ELECTRON_START_URL || `http://localhost:${runtimePort}`;
}

async function isPortAvailable(portToCheck) {
  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(portToCheck, "127.0.0.1");
  });
}

async function pickRuntimePort(startPort) {
  if (process.env.ELECTRON_START_URL) {
    return startPort;
  }

  let candidate = startPort;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
    candidate += 1;
  }

  return startPort;
}

async function waitForServer(url, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.status >= 200) {
        return true;
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return false;
}

function toPrismaSqliteUrl(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return `file:${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`;
}

async function resolveDatabaseUrl() {
  if (isDev) {
    return process.env.DATABASE_URL;
  }

  const dataDir = path.join(app.getPath("appData"), "Qrohl");
  await fs.mkdir(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "history.db");
  return toPrismaSqliteUrl(dbPath);
}

function toFilesystemPathFromPrismaUrl(databaseUrl) {
  if (!databaseUrl?.startsWith("file:")) {
    return null;
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath) {
    return null;
  }

  if (process.platform === "win32") {
    return rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  }

  return rawPath;
}

async function runDatabaseStartupHealthCheck(databaseUrl) {
  const dbPath = toFilesystemPathFromPrismaUrl(databaseUrl);

  if (!dbPath) {
    console.warn("[Qrohl][DB] Health check skipped: DATABASE_URL is not a file path.");
    return;
  }

  const dbDirectory = path.dirname(dbPath);
  await fs.mkdir(dbDirectory, { recursive: true });

  const probeFile = path.join(dbDirectory, ".qrohl-write-check.tmp");
  await fs.writeFile(probeFile, "ok", { encoding: "utf8" });
  await fs.unlink(probeFile);

  console.log(`[Qrohl][DB] Resolved DB path: ${dbPath}`);
  console.log("[Qrohl][DB] Write access check: PASS");
}

function createMainWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Qrohl",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.setMenuBarVisibility(false);

  const appUrl = getAppUrl();
  mainWindow.loadURL(appUrl);

  let reloadAttempts = 0;
  mainWindow.webContents.on("did-fail-load", async () => {
    if (reloadAttempts >= 5) {
      return;
    }

    reloadAttempts += 1;
    await appendRuntimeLog(`Window load failed, retrying attempt ${reloadAttempts}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    mainWindow?.loadURL(getAppUrl());
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

async function startNextServer() {
  if (isDev || nextProcess) {
    return;
  }

  const appRoot = path.join(__dirname, "..");
  const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
  const databaseUrl = await resolveDatabaseUrl();
  runtimePort = await pickRuntimePort(configuredPort);

  nextProcess = spawn(process.execPath, [nextBin, "start", "-p", String(runtimePort)], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_PATH: [
        process.env.NODE_PATH,
        appRoot,
        path.join(appRoot, "node_modules"),
      ].filter(Boolean).join(path.delimiter),
      NODE_ENV: "production",
      PORT: String(runtimePort),
      DATABASE_URL: databaseUrl,
    },
    stdio: "inherit",
  });

  nextProcess.on("exit", () => {
    nextProcess = null;
  });

  nextProcess.on("error", async (error) => {
    await appendRuntimeLog("Next process failed to start", error);
  });
}

app.whenReady().then(async () => {
  if (!process.env.APP_LOG_FILE) {
    const logsDir = path.join(app.getPath("appData"), "Qrohl", "logs");
    process.env.APP_LOG_FILE = path.join(logsDir, "app.log");
  }

  const databaseUrl = await resolveDatabaseUrl();
  await runDatabaseStartupHealthCheck(databaseUrl);

  await startNextServer();

  if (!isDev) {
    const ready = await waitForServer(getAppUrl(), 20000);
    if (!ready) {
      await appendRuntimeLog(`Next server did not become ready at ${getAppUrl()} within timeout`);
    }
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill("SIGTERM");
    nextProcess = null;
  }
});

process.on("unhandledRejection", async (reason) => {
  await appendRuntimeLog("Unhandled promise rejection", reason);
});

process.on("uncaughtException", async (error) => {
  await appendRuntimeLog("Uncaught exception", error);
});
