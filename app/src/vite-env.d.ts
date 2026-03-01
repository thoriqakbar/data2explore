/// <reference types="vite/client" />

type EngineCommand = "profile" | "summarize" | "check" | "report" | "performance";

interface RunEnginePayload {
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
}

interface EngineResponse {
  ok: boolean;
  stdout: string;
  stderr: string;
  data?: unknown;
}

interface Window {
  d2e: {
    runEngine: (payload: RunEnginePayload) => Promise<EngineResponse>;
    selectFile: () => Promise<string | null>;
    saveFile: (defaultName?: string, fileType?: "xlsx" | "csv" | "json") => Promise<string | null>;
    writeTempMapping: (mapping: Record<string, string>) => Promise<string>;
    writeTempConfig: (config: Record<string, unknown>) => Promise<string>;
    saveConfig: (config: unknown) => Promise<string | null>;
    loadConfig: () => Promise<unknown | null>;
    writeFile: (path: string, content: string) => Promise<boolean>;
  };
}
