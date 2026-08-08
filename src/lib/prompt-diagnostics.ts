export interface PromptDiagnostics {
  userId: string;
  displayName: string | null;
  memoryCount: number;
  threadId?: string | null;
  at: number;
}

const KEY = "hola:last-prompt-diagnostics";

export function recordPromptDiagnostics(diag: PromptDiagnostics) {
  try {
    localStorage.setItem(KEY, JSON.stringify(diag));
    window.dispatchEvent(new CustomEvent("hola:prompt-diagnostics", { detail: diag }));
  } catch {
    /* ignore */
  }
}

export function readPromptDiagnostics(): PromptDiagnostics | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PromptDiagnostics) : null;
  } catch {
    return null;
  }
}
