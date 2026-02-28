/// <reference types="vite/client" />

type EngineCommand = "profile" | "summarize";

interface RunEnginePayload {
  command: EngineCommand;
  input: string;
  out: string;
  mapping?: string;
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
    writeTempMapping: (mapping: Record<string, string>) => Promise<string>;
  };
}
