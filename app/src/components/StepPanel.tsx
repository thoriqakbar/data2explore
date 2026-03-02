import type { ReactNode } from "react";

export function StepPanel({ children }: { children: ReactNode }) {
  return <div className="step-panel">{children}</div>;
}
