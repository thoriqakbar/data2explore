import { contextBridge, ipcRenderer } from "electron";

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

contextBridge.exposeInMainWorld("d2e", {
  runEngine: (payload: RunEnginePayload) =>
    ipcRenderer.invoke("engine:run", payload),
  selectFile: () => ipcRenderer.invoke("dialog:select-file") as Promise<string | null>,
  saveFile: (defaultName?: string, fileType?: "xlsx" | "csv" | "json") =>
    ipcRenderer.invoke("dialog:save-file", defaultName, fileType) as Promise<string | null>,
  writeTempMapping: (mapping: Record<string, string>) =>
    ipcRenderer.invoke("engine:write-temp-mapping", mapping) as Promise<string>,
  writeTempConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke("engine:write-temp-config", config) as Promise<string>,
  saveConfig: (config: unknown) =>
    ipcRenderer.invoke("config:save", config) as Promise<string | null>,
  loadConfig: () =>
    ipcRenderer.invoke("config:load") as Promise<unknown | null>,
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke("file:write", path, content) as Promise<boolean>,
  getSamplePath: () =>
    ipcRenderer.invoke("app:sample-path") as Promise<string | null>,
});
