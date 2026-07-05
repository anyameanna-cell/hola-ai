import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HolaLogo } from "@/components/HolaLogo";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(5).max(4000),
});

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Hola AI" },
      { name: "description", content: "Send a message to the Hola team. We reply through in-app notifications." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, subject, body });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("contact_messages").insert({
      user_id: user?.id ?? null,
      email: parsed.data.email || user?.email || null,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Could not send — " + error.message);
      return;
    }
    setSent(true);
    setSubject("");
    setBody("");
    toast.success("Message sent — we'll reply in your notifications.");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <HolaLogo size={28} />
          <span className="font-semibold">Hola</span>
        </Link>
        {user ? (
          <Link to="/chat" className="text-sm text-primary underline">Back to chat</Link>
        ) : (
          <Link to="/auth" className="text-sm text-primary underline">Sign in</Link>
        )}
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Contact us</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a note to the Hola team. Replies land in your in-app notification bell{user ? "." : " (sign in first to receive them)."}
          </p>

          {sent ? (
            <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              Thanks — your message is in. You can send another below or head back to chat.
              <Button variant="link" onClick={() => setSent(false)} className="px-1">Send another</Button>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {!user && (
              <div className="space-y-1.5">
                <Label htmlFor="email">Your email (optional)</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={255} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000} required />
              <p className="text-xs text-muted-foreground text-right">{body.length}/4000</p>
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-brand-gradient text-white border-0 shadow-brand">
              {submitting ? "Sending…" : "Send message"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
