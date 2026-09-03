import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const CHOICE_SUBMIT_EVENT = "hola:choice-submit";

interface ChoiceSpec {
  question?: string;
  type?: "single" | "multiple";
  options: string[];
  allowOther?: boolean;
  submitLabel?: string;
}

/** Parse a ```choices block. Accepts JSON, or a plain list with an optional first-line question. */
export function parseChoiceSpec(code: string): ChoiceSpec | null {
  const raw = code.trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ChoiceSpec> & { choices?: string[] };
    const options = (j.options ?? j.choices ?? []).map(String).filter(Boolean);
    if (!options.length) return null;
    return {
      question: j.question ? String(j.question) : undefined,
      type: j.type === "multiple" ? "multiple" : "single",
      options: options.slice(0, 12),
      allowOther: Boolean(j.allowOther),
      submitLabel: j.submitLabel ? String(j.submitLabel) : undefined,
    };
  } catch {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const question = lines[0]!.endsWith("?") ? lines.shift() : undefined;
    const options = lines.map((l) => l.replace(/^[-*+]\s*|^\d+[.)]\s*/, "")).filter(Boolean);
    if (!options.length) return null;
    return { question, type: "single", options: options.slice(0, 12) };
  }
}

export function ChoiceBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const spec = parseChoiceSpec(code);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  if (!spec) return null;
  const multiple = spec.type === "multiple";

  const toggle = (opt: string) => {
    if (sent) return;
    setPicked((p) => (multiple ? (p.includes(opt) ? p.filter((o) => o !== opt) : [...p, opt]) : [opt]));
  };

  const answer = [...picked, ...(other.trim() ? [other.trim()] : [])];

  const submit = () => {
    if (!answer.length || sent) return;
    const text = spec.question ? `${spec.question} — ${answer.join(", ")}` : answer.join(", ");
    setSent(answer.join(", "));
    window.dispatchEvent(new CustomEvent(CHOICE_SUBMIT_EVENT, { detail: { text } }));
  };

  return (
    <div className="my-3 rounded-xl border bg-card p-3 not-prose">
      {spec.question ? <p className="mb-2 text-sm font-medium">{spec.question}</p> : null}
      <p className="mb-2 text-xs text-muted-foreground">
        {multiple ? "Pick any that apply" : "Pick one"}
      </p>
      <div className="flex flex-col gap-1.5">
        {spec.options.map((opt) => {
          const on = picked.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={Boolean(sent)}
              onClick={() => toggle(opt)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-70",
                on ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center border",
                  multiple ? "rounded-[4px]" : "rounded-full",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
                )}
              >
                {on ? <Check className="h-3 w-3" /> : null}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      {spec.allowOther && !sent ? (
        <Input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Something else…"
          className="mt-2"
        />
      ) : null}
      {sent ? (
        <p className="mt-2 text-xs text-muted-foreground">Answered: {sent}</p>
      ) : (
        <Button size="sm" className="mt-3" disabled={!answer.length || streaming} onClick={submit}>
          {spec.submitLabel ?? "Submit"}
        </Button>
      )}
    </div>
  );
}
