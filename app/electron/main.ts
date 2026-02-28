import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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

type EngineCommand = "profile" | "summarize" | "check" | "report";

type RunEnginePayload = {
  command: EngineCommand;
  input?: string;
  out?: string;
  outDir?: string;
  mapping?: string;
  checks?: string;
  data?: string;
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
  if (payload.checks) args.push("--checks", payload.checks);

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
              const [flagsRaw, summaryRaw] = await Promise.all([
                readFile(path.join(outDir, "flags.json"), "utf-8"),
                readFile(path.join(outDir, "summary.json"), "utf-8")
              ]);
              resolve({
                ok: true,
                stdout,
                stderr,
                data: {
                  flags: JSON.parse(flagsRaw),
                  summary: JSON.parse(summaryRaw)
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

ipcMain.handle("dialog:save-file", async (event, defaultName?: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName ?? "d2e-report.xlsx",
    filters: [
      { name: "Excel Workbook", extensions: ["xlsx"] }
    ]
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
