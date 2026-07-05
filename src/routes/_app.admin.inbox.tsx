import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { HolaLoader } from "@/components/HolaLoader";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Reply } from "lucide-react";

interface ContactMessage {
  id: string;
  user_id: string | null;
  email: string | null;
  subject: string;
  body: string;
  status: string;
  created_at: string;
}

export const Route = createFileRoute("/_app/admin/inbox")({
  component: AdminInboxPage,
});

function AdminInboxPage() {
  const { user } = useAuth();
  const { isAdmin, loading } = useIsAdmin();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [replyTitle, setReplyTitle] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");

  useEffect(() => {
    if (!isAdmin) return;
    let q = supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    q.then(({ data }) => setMessages(data ?? []));
  }, [isAdmin, filter]);

  if (loading) return <HolaLoader label="Checking access…" />;
  if (!user || !isAdmin) return <Navigate to="/chat" replace />;

  const startReply = (m: ContactMessage) => {
    setSelected(m);
    setReplyTitle(`Re: ${m.subject}`);
    setReplyBody("");
  };

  const sendReply = async () => {
    if (!selected || !selected.user_id) {
      toast.error("This message has no linked user — reply by email instead.");
      return;
    }
    if (!replyBody.trim()) {
      toast.error("Reply body required");
      return;
    }
    setSending(true);
    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: selected.user_id,
      title: replyTitle.trim() || `Re: ${selected.subject}`,
      body: replyBody.trim(),
      related_contact_id: selected.id,
    });
    if (notifErr) {
      setSending(false);
      toast.error(notifErr.message);
      return;
    }
    await supabase.from("contact_messages").update({ status: "closed" }).eq("id", selected.id);
    setSending(false);
    setSelected(null);
    setReplyBody("");
    setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, status: "closed" } : m)));
    toast.success("Reply sent to user's notifications");
  };

  const markClosed = async (m: ContactMessage) => {
    await supabase.from("contact_messages").update({ status: "closed" }).eq("id", m.id);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "closed" } : x)));
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Contact inbox</h1>
        <div className="ml-auto flex gap-1">
          {(["open", "closed", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className="w-96 border-r overflow-y-auto">
          {messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No messages</p>
          ) : (
            <ul className="divide-y">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => startReply(m)}
                    className={
                      "w-full text-left px-3 py-3 hover:bg-accent transition " +
                      (selected?.id === m.id ? "bg-accent" : "")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate">{m.subject}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(m.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.email ?? (m.user_id ? "signed-in user" : "anonymous")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{m.body}</p>
                    <span className={
                      "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] " +
                      (m.status === "open" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")
                    }>
                      {m.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="flex-1 overflow-y-auto p-6">
          {selected ? (
            <div className="max-w-2xl space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{selected.subject}</h2>
                  {selected.status === "open" && (
                    <Button variant="ghost" size="sm" onClick={() => markClosed(selected)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Close
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  From: {selected.email ?? "—"} · {selected.user_id ? "signed-in user" : "anonymous"} ·{" "}
                  {formatDistanceToNowStrict(new Date(selected.created_at), { addSuffix: true })}
                </p>
                <div className="mt-3 whitespace-pre-wrap rounded-lg border bg-card p-4 text-sm">
                  {selected.body}
                </div>
              </div>

              {selected.user_id ? (
                <div className="rounded-lg border p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Reply className="h-4 w-4" /> Reply via in-app notification
                  </h3>
                  <div className="mt-3 space-y-2">
                    <Input value={replyTitle} onChange={(e) => setReplyTitle(e.target.value)} placeholder="Notification title" maxLength={160} />
                    <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={5} placeholder="Type your reply — pops up on their notification bell." maxLength={2000} />
                    <Button onClick={sendReply} disabled={sending} className="bg-brand-gradient text-white border-0 shadow-brand">
                      {sending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Anonymous submission — no in-app user to notify. Reply to {selected.email ?? "(no email provided)"} directly.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a message to view and reply.</p>
          )}
        </section>
      </div>
    </div>
  );
}
