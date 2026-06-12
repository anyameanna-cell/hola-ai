import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Square, Sparkles, Ghost } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { HolaLogo } from "@/components/HolaLogo";
import { MarkdownContent } from "@/components/MarkdownContent";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { generateThreadTitle } from "@/lib/title.functions";
import { toast } from "sonner";

interface ChatWindowProps {
  threadId: string;
  temporary?: boolean;
}

interface DbMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: unknown;
  created_at: string;
}

function rowsToUIMessages(rows: DbMessage[]): UIMessage[] {
  return rows.map((r) => {
    let parts: UIMessage["parts"] = [];
    if (Array.isArray(r.parts)) parts = r.parts as UIMessage["parts"];
    return { id: r.id, role: r.role, parts } as UIMessage;
  });
}

function partsToText(parts: UIMessage["parts"]): string {
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

export function ChatWindow({ threadId, temporary = false }: ChatWindowProps) {
  const { user } = useAuth();
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistedIds = useRef<Set<string>>(new Set());
  const threadCreated = useRef(false);
  const titleGenerated = useRef(false);
  const makeTitle = useServerFn(generateThreadTitle);

  // Load existing messages (only when not temporary)
  useEffect(() => {
    persistedIds.current = new Set();
    threadCreated.current = false;
    titleGenerated.current = false;
    if (temporary || !user) {
      setInitialMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // Check if thread exists
      const { data: t } = await supabase.from("threads").select("id, title").eq("id", threadId).maybeSingle();
      if (t) {
        threadCreated.current = true;
        if (t.title && t.title !== "New chat") titleGenerated.current = true;
      }
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, parts, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error("Could not load conversation");
        setInitialMessages([]);
        return;
      }
      const ui = rowsToUIMessages((data ?? []) as DbMessage[]);
      ui.forEach((m) => persistedIds.current.add(m.id));
      setInitialMessages(ui);
    })();
    return () => { cancelled = true; };
  }, [threadId, temporary, user]);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initialMessages ?? [],
    transport,
    onError: (e) => toast.error(e.message ?? "Something went wrong"),
  });

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // Persist finalized messages
  useEffect(() => {
    if (temporary || !user || initialMessages === null) return;
    if (status === "streaming" || status === "submitted") return;
    const toSave = messages.filter((m) => !persistedIds.current.has(m.id));
    if (toSave.length === 0) return;

    (async () => {
      // Ensure thread row exists (lazy create on first save)
      if (!threadCreated.current) {
        const firstUserText = messages.find((m) => m.role === "user");
        const fallback = firstUserText ? partsToText(firstUserText.parts).slice(0, 60) : "New chat";
        const { error } = await supabase
          .from("threads")
          .insert({ id: threadId, user_id: user.id, title: fallback });
        if (error && !error.message.includes("duplicate")) {
          toast.error("Could not save conversation");
          return;
        }
        threadCreated.current = true;
      }

      for (const m of toSave) {
        const { error } = await supabase.from("messages").insert({
          thread_id: threadId,
          user_id: user.id,
          role: m.role as "user" | "assistant" | "system",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parts: m.parts as any,
        });
        if (!error) persistedIds.current.add(m.id);
      }
      await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

      // Auto-generate title after first exchange
      if (!titleGenerated.current && messages.length >= 2) {
        const firstUser = messages.find((m) => m.role === "user");
        const firstAssistant = messages.find((m) => m.role === "assistant");
        if (firstUser && firstAssistant) {
          titleGenerated.current = true;
          try {
            const res = await makeTitle({
              data: {
                userMessage: partsToText(firstUser.parts),
                assistantMessage: partsToText(firstAssistant.parts),
              },
            });
            if (res?.title) {
              await supabase.from("threads").update({ title: res.title }).eq("id", threadId);
            }
          } catch { /* non-fatal */ }
        }
      }
    })();
  }, [messages, status, threadId, user, temporary, initialMessages, makeTitle]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    if (!user) return;
    setInput("");
    await sendMessage({ text });
  };

  const isBusy = status === "streaming" || status === "submitted";
  const showEmpty = (initialMessages?.length ?? 0) === 0 && messages.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {temporary && (
        <div className="border-b bg-muted/40 px-4 py-2 text-xs flex items-center gap-2 justify-center text-muted-foreground">
          <Ghost className="h-3.5 w-3.5" /> Temporary chat — nothing is saved.
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {showEmpty ? (
          <EmptyState onPick={(t) => setInput(t)} temporary={temporary} />
        ) : (
          <div className="mx-auto max-w-3xl w-full px-4 py-6 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} streaming={status === "streaming" && m === messages[messages.length - 1]} />
              ))}
            </AnimatePresence>
            {status === "submitted" && <ThinkingBubble />}
          </div>
        )}
      </div>

      <div className="border-t bg-background/80 backdrop-blur">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl w-full px-4 py-3">
          <div className="relative rounded-2xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring transition">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              placeholder={temporary ? "Message Hola (temporary)..." : "Message Hola..."}
              rows={1}
              className="min-h-[56px] max-h-60 resize-none border-0 bg-transparent pr-14 focus-visible:ring-0 shadow-none"
              autoFocus
            />
            <div className="absolute right-2 bottom-2">
              {isBusy ? (
                <Button type="button" size="icon" onClick={() => stop()} className="rounded-full bg-foreground text-background hover:opacity-90 h-9 w-9">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim()} className="rounded-full bg-brand-gradient text-white border-0 shadow-brand h-9 w-9 disabled:opacity-40">
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Hola can make mistakes. Verify important info.
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  const text = partsToText(message.parts);

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 whitespace-pre-wrap">
          {text}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <HolaLogo size={32} className="mt-0.5 shrink-0" />
      <div className={`flex-1 min-w-0 ${streaming ? "streaming-caret" : ""}`}>
        <MarkdownContent>{text}</MarkdownContent>
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
      <HolaLogo size={32} className="mt-0.5 shrink-0" />
      <div className="flex items-center gap-1.5 py-2.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
      </div>
    </motion.div>
  );
}

const SUGGESTIONS = [
  "Explain quantum entanglement like I'm 12",
  "Draw a mermaid flowchart of a login flow",
  "Summarize the pros and cons of remote work",
  "Help me plan a 3-day trip to Lisbon",
];

function EmptyState({ onPick, temporary }: { onPick: (t: string) => void; temporary: boolean }) {
  return (
    <div className="h-full min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
        <HolaLogo size={80} />
      </motion.div>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">
        Hola, <span className="text-brand-gradient">how can I help?</span>
      </h1>
      <p className="mt-2 text-muted-foreground flex items-center gap-1.5">
        {temporary ? <><Ghost className="h-4 w-4" /> Temporary chat — nothing is saved.</> : <><Sparkles className="h-4 w-4" /> Ask anything, or try a prompt below.</>}
      </p>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-sm rounded-xl border bg-card px-4 py-3 hover:bg-accent hover:border-primary/40 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
