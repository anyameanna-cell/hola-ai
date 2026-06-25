import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Square, Sparkles, Ghost, ImageIcon, Loader2, Mic, MicOff, Volume2, VolumeX, Paperclip, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/ThemeProvider";
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
  const [threadExists, setThreadExists] = useState(false);
  const [titleAlreadySet, setTitleAlreadySet] = useState(false);

  useEffect(() => {
    setInitialMessages(null);
    setThreadExists(false);
    setTitleAlreadySet(false);
    if (temporary || !user) {
      setInitialMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: t } = await supabase.from("threads").select("id, title").eq("id", threadId).maybeSingle();
      if (cancelled) return;
      if (t) {
        setThreadExists(true);
        if (t.title && t.title !== "New chat") setTitleAlreadySet(true);
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
      setInitialMessages(rowsToUIMessages((data ?? []) as DbMessage[]));
    })();
    return () => { cancelled = true; };
  }, [threadId, temporary, user]);

  if (initialMessages === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <HolaLogo size={48} className="opacity-60 animate-pulse" />
      </div>
    );
  }

  return (
    <ChatWindowInner
      threadId={threadId}
      temporary={temporary}
      initialMessages={initialMessages}
      initialThreadExists={threadExists}
      initialTitleAlreadySet={titleAlreadySet}
    />
  );
}

function ChatWindowInner({
  threadId,
  temporary,
  initialMessages,
  initialThreadExists,
  initialTitleAlreadySet,
}: {
  threadId: string;
  temporary: boolean;
  initialMessages: UIMessage[];
  initialThreadExists: boolean;
  initialTitleAlreadySet: boolean;
}) {
  const { user } = useAuth();
  const { theme, mode, fontFamily, fontSize, aiCanRename } = useTheme();
  const [input, setInput] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<{ title: string; snippet?: string }[]>([]);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState<{ id: string; url: string; mediaType: string; name: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const persistedIds = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const threadCreated = useRef(initialThreadExists);
  const titleGenerated = useRef(initialTitleAlreadySet);
  const lastRetitledAt = useRef(0);
  const makeTitle = useServerFn(generateThreadTitle);

  // Load profile name + recent thread titles+snippets for long-term memory
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadName = () => {
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (!cancelled) setDisplayName(data?.display_name ?? null); });
    };
    loadName();
    const onProfileChanged = () => loadName();
    window.addEventListener("hola:profile-changed", onProfileChanged);
    (async () => {
      const { data: threads } = await supabase
        .from("threads").select("id, title")
        .eq("user_id", user.id).neq("id", threadId)
        .order("updated_at", { ascending: false }).limit(8);
      if (!threads?.length) { setRecentChats([]); return; }
      const ids = threads.map((t) => t.id);
      const { data: msgs } = await supabase
        .from("messages").select("thread_id, role, parts, created_at")
        .in("thread_id", ids).eq("role", "user")
        .order("created_at", { ascending: true });
      const firstByThread = new Map<string, string>();
      for (const m of msgs ?? []) {
        if (firstByThread.has(m.thread_id)) continue;
        const parts = Array.isArray(m.parts) ? m.parts : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = parts.map((p: any) => (p?.type === "text" ? p.text : "")).join("").slice(0, 140);
        firstByThread.set(m.thread_id, text);
      }
      if (!cancelled) setRecentChats(threads.map((t) => ({ title: t.title, snippet: firstByThread.get(t.id) })));
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("hola:profile-changed", onProfileChanged);
    };
  }, [user, threadId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id, body }) => ({
          body: {
            id,
            messages,
            ...body,
            context: {
              displayName: displayName ?? user?.user_metadata?.full_name ?? null,
              email: user?.email,
              theme, mode, fontFamily, fontSize,
              temporary,
              recentChats,
            },
          },
        }),
      }),
    [displayName, user, theme, mode, fontFamily, fontSize, temporary, recentChats],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message ?? "Something went wrong"),
  });

  const isBusy = status === "streaming" || status === "submitted";


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (temporary || !user) return;
    if (status === "streaming" || status === "submitted") return;
    const toSave = messages.filter((m) => !persistedIds.current.has(m.id));
    if (toSave.length === 0) return;

    (async () => {
      if (!threadCreated.current) {
        const firstUser = messages.find((m) => m.role === "user");
        const fallback = firstUser ? partsToText(firstUser.parts).slice(0, 60) : "New chat";
        const { error } = await supabase
          .from("threads")
          .insert({ id: threadId, user_id: user.id, title: fallback });
        if (error && !error.message.toLowerCase().includes("duplicate")) {
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
      window.dispatchEvent(new CustomEvent("hola:threads-changed"));


      const userCount = messages.filter((m) => m.role === "user").length;
      const shouldRetitle =
        (!titleGenerated.current && messages.length >= 2) ||
        (aiCanRename && titleGenerated.current && userCount >= 4 && userCount - lastRetitledAt.current >= 4);

      if (shouldRetitle) {
        const fu = messages.find((m) => m.role === "user");
        const lu = [...messages].reverse().find((m) => m.role === "user");
        const la = [...messages].reverse().find((m) => m.role === "assistant");
        if (fu && la) {
          titleGenerated.current = true;
          lastRetitledAt.current = userCount;
          try {
            const res = await makeTitle({
              data: {
                userMessage: partsToText((lu ?? fu).parts),
                assistantMessage: partsToText(la.parts),
              },
            });
            if (res?.title) {
              await supabase.from("threads").update({ title: res.title }).eq("id", threadId);
              window.dispatchEvent(new CustomEvent("hola:threads-changed"));
            }
          } catch { /* non-fatal */ }
        }
      }
    })();
  }, [messages, status, threadId, user, temporary, makeTitle, aiCanRename]);

  // Auto-resize textarea so input bar grows smoothly instead of jumping
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [input]);

  const handleGenerateImage = async () => {
    const prompt = input.trim();
    if (!prompt || generatingImage || isBusy || !user) return;
    setInput("");
    setGeneratingImage(true);
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    // Optimistically show the user prompt
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", parts: [{ type: "text", text: `🎨 ${prompt}` }] } as UIMessage,
    ]);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url: string };
      const assistantParts = [{ type: "text", text: `![generated image](${url})` }];
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", parts: assistantParts } as UIMessage,
      ]);
      // Persist to DB
      if (!temporary) {
        if (!threadCreated.current) {
          await supabase.from("threads").insert({ id: threadId, user_id: user.id, title: prompt.slice(0, 40) });
          threadCreated.current = true;
        }
        await supabase.from("messages").insert([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: userMsgId, thread_id: threadId, user_id: user.id, role: "user", parts: [{ type: "text", text: `🎨 ${prompt}` }] as any },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: assistantMsgId, thread_id: threadId, user_id: user.id, role: "assistant", parts: assistantParts as any },
        ]);
        persistedIds.current.add(userMsgId);
        persistedIds.current.add(assistantMsgId);
        await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        window.dispatchEvent(new CustomEvent("hola:threads-changed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGeneratingImage(false);
    }
  };

  const toggleVoiceInput = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    if (!SR) {
      toast.error("Voice input isn't supported in this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((prev) => (prev ? prev + " " : "") + (finalText || interim).trim());
    };
    rec.onerror = () => { setListening(false); };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} is too large (max 8MB)`); continue; }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      setAttachments((prev) => [...prev, { id: crypto.randomUUID(), url: dataUrl, mediaType: f.type, name: f.name }]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || status === "streaming" || status === "submitted") return;
    if (!user) return;
    setInput("");
    const atts = attachments;
    setAttachments([]);
    if (atts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileParts: any[] = atts.map((a) => ({ type: "file", url: a.url, mediaType: a.mediaType }));
      await sendMessage({ role: "user", parts: [...fileParts, { type: "text", text: text || "" }] });
    } else {
      await sendMessage({ text });
    }
  };

  const showEmpty = messages.length === 0;

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
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="relative group">
                  {a.mediaType.startsWith("image/") ? (
                    <img src={a.url} alt={a.name} className="h-16 w-16 object-cover rounded-lg border" />
                  ) : (
                    <div className="h-16 px-3 flex items-center rounded-lg border bg-card text-xs max-w-[180px] truncate">{a.name}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border flex items-center justify-center"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative rounded-2xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring transition">
            <Textarea
              ref={textareaRef}
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
              className="min-h-[56px] max-h-60 resize-none border-0 bg-transparent pl-28 pr-24 text-center placeholder:text-center focus-visible:ring-0 shadow-none overflow-hidden"
              autoFocus
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFilePick}
            />
            <div className="absolute left-2 bottom-2 flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Attach image"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Generate image from prompt"
                disabled={!input.trim() || generatingImage || isBusy}
                onClick={handleGenerateImage}
                className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                {generatingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title={listening ? "Stop listening" : "Voice input"}
                onClick={toggleVoiceInput}
                className={`rounded-full h-9 w-9 ${listening ? "text-red-500 animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>
            <div className="absolute right-2 bottom-2">
              {isBusy ? (
                <Button type="button" size="icon" onClick={() => stop()} className="rounded-full bg-foreground text-background hover:opacity-90 h-9 w-9">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim() && attachments.length === 0} className="rounded-full bg-brand-gradient text-white border-0 shadow-brand h-9 w-9 disabled:opacity-40">
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
