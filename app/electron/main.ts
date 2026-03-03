import { app, BrowserWindow, ipcMain, dialog } from "electron";
import type { FileFilter } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

type EngineCommand = "profile" | "summarize" | "check" | "report" | "performance";

type RunEnginePayload = {
  command: EngineCommand;
  input?: string;
  out?: string;
  outDir?: string;
  mapping?: string;
  checks?: string;
  data?: string;
  config?: string;
  priorFlags?: string;
  appVersion?: string;
  checkSummary?: string;
};

ipcMain.handle("engine:run", async (_event, payload: RunEnginePayload) => {
  const repoRoot = path.resolve(__dirname, "../..");
  const engineCwd = path.join(repoRoot, "engine");
  const resolveUserPath = (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(repoRoot, p);

  const args = [
    "run",
    "python",
    "-m",
    "d2e_engine",
    payload.command,
  ];

  const isCheck = payload.command === "check";
  const isReport = payload.command === "report";

  if (isReport) {
    args.push("--data", resolveUserPath(payload.data!));
    args.push("--out", resolveUserPath(payload.out!));
  } else {
    args.push("--input", resolveUserPath(payload.input!));
    if (isCheck) {
      args.push("--out-dir", resolveUserPath(payload.outDir!));
    } else {
      args.push("--out", resolveUserPath(payload.out!));
    }
  }

  if (payload.mapping) args.push("--mapping", resolveUserPath(payload.mapping));
  if (payload.config) args.push("--config", resolveUserPath(payload.config));
  if (payload.checks) args.push("--checks", payload.checks);
  if (payload.priorFlags) args.push("--prior-flags", resolveUserPath(payload.priorFlags));
  if (payload.appVersion) args.push("--app-version", payload.appVersion);
  if (payload.checkSummary) args.push("--check-summary", resolveUserPath(payload.checkSummary));

  return new Promise<{ ok: boolean; stdout: string; stderr: string; data?: unknown }>(
    (resolve) => {
      const child = spawn("uv", args, {
        cwd: engineCwd,
        shell: false
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      child.on("error", (error) => {
        resolve({
          ok: false,
          stdout,
          stderr: `${stderr}\n${error.message}`
        });
      });
      child.on("close", async (code) => {
        if (code === 0) {
          try {
            if (isCheck) {
              const outDir = resolveUserPath(payload.outDir!);
              const [flagsRaw, summaryRaw, metadataRaw] = await Promise.all([
                readFile(path.join(outDir, "flags.json"), "utf-8"),
                readFile(path.join(outDir, "summary.json"), "utf-8"),
                readFile(path.join(outDir, "run_metadata.json"), "utf-8"),
              ]);
              resolve({
                ok: true,
                stdout,
                stderr,
                data: {
                  flags: JSON.parse(flagsRaw),
                  summary: JSON.parse(summaryRaw),
                  run_metadata: JSON.parse(metadataRaw),
                }
              });
            } else {
              const json = await readFile(resolveUserPath(payload.out!), "utf-8");
              resolve({ ok: true, stdout, stderr, data: JSON.parse(json) });
            }
            return;
          } catch {
            // fall through — return without parsed data
          }
        }
        resolve({ ok: code === 0, stdout, stderr });
      });
    }
  );
});

ipcMain.handle("dialog:select-file", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    console.error("dialog:select-file — no BrowserWindow found");
    return null;
  }
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      { name: "Survey Data", extensions: ["csv", "xlsx", "dta", "txt"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:save-file", async (event, defaultName?: string, fileType: "xlsx" | "csv" | "json" | "do" = "xlsx") => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const filtersByType: Record<"xlsx" | "csv" | "json" | "do", FileFilter[]> = {
    xlsx: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    csv: [{ name: "CSV", extensions: ["csv"] }],
    json: [{ name: "JSON", extensions: ["json"] }],
    do: [{ name: "Stata Do-file", extensions: ["do"] }],
  };
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName ?? "d2e-report.xlsx",
    filters: filtersByType[fileType],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle(
  "engine:write-temp-mapping",
  async (_event, mapping: Record<string, string>) => {
    const tempDir = app.getPath("temp");
    const filename = `d2e-mapping-${randomUUID()}.json`;
    const tempPath = path.join(tempDir, filename);
    await writeFile(tempPath, JSON.stringify(mapping, null, 2), "utf-8");
    return tempPath;
  }
);

ipcMain.handle(
  "engine:write-temp-config",
  async (_event, config: Record<string, unknown>) => {
    const tempDir = app.getPath("temp");
    const filename = `d2e-config-${randomUUID()}.json`;
    const tempPath = path.join(tempDir, filename);
    await writeFile(tempPath, JSON.stringify(config, null, 2), "utf-8");
    return tempPath;
  }
);

ipcMain.handle("config:save", async (event, config: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const result = await dialog.showSaveDialog(win, {
    title: "Save Configuration",
    defaultPath: "d2e-config.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, JSON.stringify(config, null, 2), "utf-8");
  return result.filePath;
});

ipcMain.handle("config:load", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    title: "Load Configuration",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const raw = await readFile(result.filePaths[0], "utf-8");
  return JSON.parse(raw);
});

ipcMain.handle("file:write", async (_event, filePath: string, content: string) => {
  await writeFile(filePath, content, "utf-8");
  return true;
});

ipcMain.handle("decisions:load", async (_event, outDir: string) => {
  const decisionsPath = path.join(outDir, "decisions.json");
  try {
    const raw = await readFile(decisionsPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle("decisions:save", async (_event, outDir: string, data: unknown) => {
  const decisionsPath = path.join(outDir, "decisions.json");
  await writeFile(decisionsPath, JSON.stringify(data, null, 2), "utf-8");
  return true;
});

ipcMain.handle("decisions:import-csv", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    title: "Import Reviewed CSV",
    filters: [{ name: "CSV", extensions: ["csv"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const content = await readFile(result.filePaths[0], "utf-8");
  return content;
});

ipcMain.handle("dofile:read", async (_event, outDir: string) => {
  const doPath = path.join(outDir, "export_checks.do");
  try {
    return await readFile(doPath, "utf-8");
  } catch {
    return null;
  }
});

ipcMain.handle("app:sample-path", async () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const samplePath = path.join(repoRoot, "samples", "sample_survey.csv");
  try {
    await readFile(samplePath);
    return samplePath;
  } catch {
    return null;
  }
});

// --- Recent Projects store ---

type RecentProject = {
  filePath: string;
  fileName: string;
  lastRunAt: string;
  rowCount: number;
  colCount: number;
};

const MAX_RECENT = 8;

function getRecentProjectsPath(): string {
  return path.join(app.getPath("userData"), "recent-projects.json");
}

async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const raw = await readFile(getRecentProjectsPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRecentProjects(projects: RecentProject[]): Promise<void> {
  await writeFile(getRecentProjectsPath(), JSON.stringify(projects, null, 2), "utf-8");
}

async function upsertRecentProject(entry: RecentProject): Promise<void> {
  const projects = await readRecentProjects();
  const idx = projects.findIndex((p) => p.filePath === entry.filePath);
  if (idx !== -1) projects.splice(idx, 1);
  projects.unshift(entry);
  if (projects.length > MAX_RECENT) projects.length = MAX_RECENT;
  await writeRecentProjects(projects);
}

ipcMain.handle("recent-projects:list", async () => {
  const projects = await readRecentProjects();
  const valid: RecentProject[] = [];
  for (const p of projects) {
    try {
      await access(p.filePath);
      valid.push(p);
    } catch {
      // file no longer exists — skip
    }
  }
  // Persist the cleaned list if entries were removed
  if (valid.length !== projects.length) {
    await writeRecentProjects(valid);
  }
  return valid;
});

ipcMain.handle("recent-projects:remove", async (_event, filePath: string) => {
  const projects = await readRecentProjects();
  const filtered = projects.filter((p) => p.filePath !== filePath);
  await writeRecentProjects(filtered);
  return true;
});

ipcMain.handle(
  "config:auto-save",
  async (_event, filePath: string, config: unknown, recentEntry?: RecentProject) => {
    const sidecarPath = filePath + ".d2e-config.json";
    await writeFile(sidecarPath, JSON.stringify(config, null, 2), "utf-8");
    if (recentEntry) {
      await upsertRecentProject(recentEntry);
    }
    return true;
  }
);

ipcMain.handle("config:auto-load", async (_event, filePath: string) => {
  const sidecarPath = filePath + ".d2e-config.json";
  try {
    const raw = await readFile(sidecarPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
