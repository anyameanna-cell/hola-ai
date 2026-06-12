import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import mermaid from "mermaid";

let mermaidInit = false;
function ensureMermaid(dark: boolean) {
  if (!mermaidInit) {
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "inherit",
    });
    mermaidInit = true;
  }
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = useRef(`mmd-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    ensureMermaid(dark);
    let cancelled = false;
    (async () => {
      try {
        const { svg } = await mermaid.render(id.current, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Diagram error");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (err) {
    return (
      <pre className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive overflow-auto">
        Mermaid error: {err}
        {"\n\n"}{code}
      </pre>
    );
  }
  return <div ref={ref} className="my-3 rounded-lg border bg-card p-3 overflow-auto flex justify-center" />;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };
  return (
    <div className="group relative my-3 rounded-lg border bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/60">
        <span className="font-mono">{language || "code"}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-background transition text-xs"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        onClick={onCopy}
        className="cursor-pointer overflow-x-auto p-3 text-sm font-mono leading-relaxed"
        title="Click to copy"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose-chat text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          hr: () => <hr className="my-6 border-border" />,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match?.[1] ?? "";
            const code = String(children).replace(/\n$/, "");
            if (inline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em] font-mono" {...props}>
                  {children}
                </code>
              );
            }
            if (lang === "mermaid") return <MermaidBlock code={code} />;
            return <CodeBlock language={lang} code={code} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
