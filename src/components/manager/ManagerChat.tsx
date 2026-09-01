import { useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Attachment {
  id: string;
  url: string;
  mediaType: string;
  name: string;
}

export function ManagerChat({ staffEmail }: { staffEmail: string }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

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
              manager: true,
              displayName: staffEmail,
              email: user?.email,
              temporary: true,
              messageLength: "long",
              behavior: "professional",
            },
          },
        }),
      }),
    [staffEmail, user],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: "haim",
    transport,
    onError: (e) => toast.error(e.message ?? "Something went wrong"),
  });

  const busy = status === "streaming" || status === "submitted";

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 6)) {
      if (f.size > 12 * 1024 * 1024) {
        toast.error(`${f.name} is larger than 12 MB`);
        continue;
      }
      const url: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), url, mediaType: f.type || "application/octet-stream", name: f.name },
      ]);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !attachments.length) || busy) return;
    setInput("");
    const atts = attachments;
    setAttachments([]);
    if (atts.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = atts.map((a) => ({ type: "file", url: a.url, mediaType: a.mediaType }));
      await sendMessage({ role: "user", parts: [...parts, { type: "text", text: text || "" }] });
    } else {
      await sendMessage({ text });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Describe the change you want in Hola. HAIM writes the code, explains it, and you can save it as a
            draft in the Code tab.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("rounded-xl px-3 py-2 text-sm", m.role === "user" ? "bg-accent/60 ml-8" : "bg-muted/40 mr-8")}>
            <MarkdownContent
              content={m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("")}
            />
          </div>
        ))}
      </div>

      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              {a.name}
              <button type="button" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-2 flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Attach files">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell HAIM what to change…"
          rows={2}
          className="min-h-[44px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e as unknown as FormEvent);
            }
          }}
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => stop()}>Stop</Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Send"><Send className="h-4 w-4" /></Button>
        )}
      </form>
    </div>
  );
}
