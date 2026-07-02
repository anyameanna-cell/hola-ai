const REMEMBER_COMMENT_RE = /<!--\s*REMEMBER:\s*([\s\S]*?)\s*-->/gi;

export function stripMemoryComments(text: string): string {
  return text
    .replace(/<!--\s*REMEMBER:[\s\S]*?-->/gi, "")
    .replace(/<!--\s*REMEMBER:[\s\S]*$/gi, "")
    .replace(/[ \t]*\n[ \t]*\n+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function normalizeMemory(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.。!！?？]+$/g, "")
    .trim()
    .toLowerCase();
}

export function cleanMemory(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function extractMemoryComments(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const match of text.matchAll(REMEMBER_COMMENT_RE)) {
    const cleaned = cleanMemory(match[1] ?? "");
    const key = normalizeMemory(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    results.push(cleaned);
  }
  return results;
}

export function getFreshMemories(existing: string[], candidates: string[]): string[] {
  const seen = new Set(existing.map(normalizeMemory).filter(Boolean));
  const fresh: string[] = [];
  for (const candidate of candidates) {
    const cleaned = cleanMemory(candidate);
    const key = normalizeMemory(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    fresh.push(cleaned);
  }
  return fresh;
}

export function extractUserMemoryRequests(text: string): string[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const candidates: string[] = [];
  for (const line of lines) {
    const explicit = line.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i);
    if (explicit?.[1]) candidates.push(explicit[1]);

    const name = line.match(/^my\s+name\s+is\s+([^.!?\n]{1,80})/i);
    if (name?.[1]) candidates.push(`The user's name is ${name[1].trim()}`);

    const favorite = line.match(/^my\s+(favorite|favourite)\s+([^.!?\n]{2,50})\s+is\s+([^.!?\n]{1,100})/i);
    if (favorite?.[2] && favorite?.[3]) candidates.push(`The user's favorite ${favorite[2].trim()} is ${favorite[3].trim()}`);
  }
  return getFreshMemories([], candidates);
}