import { contextBridge, ipcRenderer } from "electron";

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

contextBridge.exposeInMainWorld("d2e", {
  runEngine: (payload: RunEnginePayload) =>
    ipcRenderer.invoke("engine:run", payload),
  selectFile: () => ipcRenderer.invoke("dialog:select-file") as Promise<string | null>,
  saveFile: (defaultName?: string) =>
    ipcRenderer.invoke("dialog:save-file", defaultName) as Promise<string | null>,
  writeTempMapping: (mapping: Record<string, string>) =>
    ipcRenderer.invoke("engine:write-temp-mapping", mapping) as Promise<string>
});
