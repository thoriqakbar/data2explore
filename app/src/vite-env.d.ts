/// <reference types="vite/client" />

type EngineCommand = "profile" | "summarize" | "check" | "report";

interface RunEnginePayload {
  command: EngineCommand;
  input?: string;
  out?: string;
  outDir?: string;
  mapping?: string;
  checks?: string;
  data?: string;
  config?: string;
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
    saveFile: (defaultName?: string) => Promise<string | null>;
    writeTempMapping: (mapping: Record<string, string>) => Promise<string>;
    writeTempConfig: (config: Record<string, unknown>) => Promise<string>;
  };
}
