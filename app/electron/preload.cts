import { contextBridge, ipcRenderer } from "electron";

type EngineCommand = "profile" | "summarize";

type RunEnginePayload = {
  command: EngineCommand;
  input: string;
  out: string;
  mapping?: string;
};

contextBridge.exposeInMainWorld("d2e", {
  runEngine: (payload: RunEnginePayload) =>
    ipcRenderer.invoke("engine:run", payload),
  selectFile: () => ipcRenderer.invoke("dialog:select-file") as Promise<string | null>,
  writeTempMapping: (mapping: Record<string, string>) =>
    ipcRenderer.invoke("engine:write-temp-mapping", mapping) as Promise<string>
});
