import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Maximize2, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import mermaid from "mermaid";

// Init mermaid exactly once for the page
let mermaidInit = false;
function ensureMermaid() {
  if (mermaidInit) return;
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "inherit",
    flowchart: { useMaxWidth: true, htmlLabels: true },
  });
  mermaidInit = true;
}

// Add native <title> tooltips to every node so hovering shows the label
function enrichTooltips(host: HTMLElement) {
  host.querySelectorAll<SVGGElement>("g.node").forEach((node) => {
    if (node.querySelector(":scope > title")) return;
    const label = node.querySelector(".nodeLabel")?.textContent?.trim();
    const id = node.getAttribute("id") ?? "";
    const text = label || id;
    if (!text) return;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = text;
    node.insertBefore(t, node.firstChild);
  });
  host.querySelectorAll<SVGGElement>("g.edgeLabel").forEach((edge) => {
    const text = edge.textContent?.trim();
    if (!text || edge.querySelector(":scope > title")) return;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = text;
    edge.appendChild(t);
  });
}

const MermaidBlock = memo(function MermaidBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const id = useMemo(() => `mmd-${Math.abs(hash(code))}`, [code]);

  useEffect(() => {
    if (streaming) return; // wait until streaming finishes to render
    ensureMermaid();
    let cancelled = false;
    (async () => {
      try {
        // Pre-validate to avoid mermaid injecting its bomb error SVG into the DOM
        const ok = await mermaid.parse(code, { suppressErrors: true });
        if (!ok) {
          if (!cancelled) setSvg(null);
          return;
        }
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;
        setSvg(svg);
      } catch {
        if (!cancelled) setSvg(null);
      }
    })();
    return () => { cancelled = true; };
  }, [code, id, streaming]);

  useEffect(() => {
    if (svg && ref.current) enrichTooltips(ref.current);
  }, [svg]);

  if (streaming) {
    return (
      <div className="my-3 rounded-lg border bg-card p-4 flex items-center gap-3">
        <svg width="72" height="56" viewBox="0 0 72 56" className="text-primary" aria-label="Sketching diagram">
          <line x1="16" y1="16" x2="40" y2="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3">
            <animate attributeName="stroke-dashoffset" values="0;-12" dur="1.4s" repeatCount="indefinite" />
          </line>
          <line x1="40" y1="16" x2="40" y2="40" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3">
            <animate attributeName="stroke-dashoffset" values="0;-12" dur="1.4s" repeatCount="indefinite" />
          </line>
          <line x1="16" y1="16" x2="40" y2="40" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3">
            <animate attributeName="stroke-dashoffset" values="0;-12" dur="1.4s" repeatCount="indefinite" />
          </line>
          <g style={{ animation: "hola-shape-float-a 2.2s ease-in-out infinite" }}>
            <polygon points="16,10 22,20 10,20" fill="currentColor" opacity="0.9" />
          </g>
          <g style={{ animation: "hola-shape-float-b 2.4s ease-in-out infinite" }}>
            <rect x="34" y="10" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.9" />
          </g>
          <g style={{ animation: "hola-shape-float-c 2.6s ease-in-out infinite" }}>
            <circle cx="40" cy="40" r="6" fill="currentColor" opacity="0.9" />
          </g>
        </svg>
        <span className="text-sm text-muted-foreground italic">Generating diagram…</span>
      </div>
    );
  }

  if (!svg) {
    return (
      <pre className="my-3 rounded-lg border bg-muted/40 p-3 text-xs overflow-auto whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <>
      <div
        className="mermaid-host group relative my-3 rounded-lg border bg-card p-3 overflow-auto flex justify-center cursor-zoom-in"
        onClick={() => setZoomed(true)}
        title="Click to enlarge"
      >
        <div ref={ref} dangerouslySetInnerHTML={{ __html: svg }} />
        <button
          type="button"
          className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border opacity-0 group-hover:opacity-100 transition"
          onClick={(e) => { e.stopPropagation(); setZoomed(true); }}
          aria-label="Enlarge diagram"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {zoomed && <MermaidZoomModal svg={svg} onClose={() => setZoomed(false)} />}
    </>
  );
});

function MermaidZoomModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale((s) => Math.min(5, Math.max(0.3, s + delta)));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPos({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
  };
  const endDrag = () => { dragging.current = null; };
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-3 border-b bg-card/80" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setScale((s) => Math.max(0.3, s - 0.25))} className="p-2 rounded-md border hover:bg-accent" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <button type="button" onClick={() => setScale((s) => Math.min(5, s + 0.25))} className="p-2 rounded-md border hover:bg-accent" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" onClick={reset} className="p-2 rounded-md border hover:bg-accent" aria-label="Reset"><RotateCcw className="h-4 w-4" /></button>
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">{Math.round(scale * 100)}%</span>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full border hover:bg-accent" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <div
          className="w-full h-full flex items-center justify-center [&_svg]:!max-w-none [&_svg]:!max-h-none [&_svg]:!w-auto [&_svg]:!h-auto"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging.current ? "none" : "transform 0.08s linear",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="p-2 text-center text-xs text-muted-foreground border-t bg-card/60">
        Scroll to zoom · Drag to pan · Buttons for precise control
      </div>
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

const CodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
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
});

function ZoomableImage({ src, alt }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="my-3 max-w-full rounded-lg border cursor-zoom-in"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-card border"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={src} alt={alt ?? ""} className="max-w-[95vw] max-h-[90vh] rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

export function MarkdownContent({ children, streaming }: { children: string; streaming?: boolean }) {
  return (
    <div className="prose-chat text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          hr: () => <hr className="my-6 border-border" />,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          img: ({ src, alt }: any) => <ZoomableImage src={String(src ?? "")} alt={alt} />,
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
            if (lang === "mermaid") return <MermaidBlock code={code} streaming={streaming} />;
            return <CodeBlock language={lang} code={code} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
