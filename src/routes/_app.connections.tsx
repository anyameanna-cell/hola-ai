import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, RefreshCw, Send, Sheet, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  disconnectGoogle,
  getGoogleStatus,
  readGmail,
  readSheet,
  startGoogleConnect,
} from "@/lib/google.functions";
import {
  createTelegramLinkCode,
  getTelegramLink,
  unlinkTelegram,
} from "@/lib/telegram-link.functions";
import { readPromptDiagnostics, type PromptDiagnostics } from "@/lib/prompt-diagnostics";

export const Route = createFileRoute("/_app/connections")({
  component: ConnectionsPage,
  head: () => ({
    meta: [
      { title: "Connections & Diagnostics — Hola AI" },
      {
        name: "description",
        content:
          "Connect your own Gmail and Google Sheets in read-only mode, link Telegram, and verify Ultra Memory and name sync.",
      },
      { property: "og:title", content: "Connections & Diagnostics — Hola AI" },
      {
        property: "og:description",
        content: "Read-only Google access, Telegram linking, and live Ultra Memory diagnostics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ConnectorStatus = { id: string; configured: boolean; connected: boolean };

function waitForOAuthCompletion(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string })?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") return resolve();
      popup.close();
      reject(new Error("Google connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before finishing."));
    }, 500);
  });
}

function ConnectionsPage() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<ConnectorStatus[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [diag, setDiag] = useState<PromptDiagnostics | null>(null);
  const [telegram, setTelegram] = useState<{ linked: boolean; chatId: number | null }>({
    linked: false,
    chatId: null,
  });
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [gmailQuery, setGmailQuery] = useState("");
  const [sheetRef, setSheetRef] = useState("");
  const [sheetRange, setSheetRange] = useState("");
  const [result, setResult] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!user) return;
    setDiag(readPromptDiagnostics());
    const [profile, memories] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    setDisplayName(profile.data?.display_name ?? null);
    setMemoryCount(memories.count ?? 0);
    try {
      const [status, tg] = await Promise.all([getGoogleStatus(), getTelegramLink()]);
      setStatuses(status.connectors);
      setTelegram(tg);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async (connectorId: string) => {
    setBusy(connectorId);
    const popup = window.open("", "hola-google-oauth", "width=600,height=720");
    if (!popup) {
      setBusy(null);
      toast.error("Popup blocked — allow popups and try again.");
      return;
    }
    try {
      const { authorizationUrl } = await startGoogleConnect({ data: { connectorId } });
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      await completion;
      toast.success("Connected — read-only access granted.");
      await refresh();
    } catch (error) {
      popup.close();
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (connectorId: string) => {
    setBusy(connectorId);
    try {
      await disconnectGoogle({ data: { connectorId } });
      toast.success("Disconnected.");
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runGmail = async () => {
    setBusy("gmail-run");
    setResult("");
    try {
      const data = await readGmail({ data: { query: gmailQuery || undefined, limit: 5 } });
      setResult(
        data.messages.length === 0
          ? "No matching emails."
          : data.messages
              .map((m, i) => `${i + 1}. ${m.subject}\n   from: ${m.from}\n   ${m.snippet}`)
              .join("\n\n"),
      );
    } catch (error) {
      setResult(`❌ ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const runSheet = async () => {
    setBusy("sheet-run");
    setResult("");
    try {
      const data = await readSheet({
        data: { spreadsheet: sheetRef, range: sheetRange || undefined },
      });
      setResult(
        `${data.title} — ${data.range}\n\n${data.values.map((r) => r.join(" | ")).join("\n") || "(empty range)"}`,
      );
    } catch (error) {
      setResult(`❌ ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const google = (id: string) => statuses.find((s) => s.id === id);
  const identityLabel = displayName?.trim() || user?.email || user?.id || "—";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connections & Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Read-only Google access, Telegram commands, and live Ultra Memory checks.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Quick diagnostics</CardTitle>
                <CardDescription>What Hola actually loaded for your last prompt.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border p-3 font-mono text-xs break-all space-y-1">
              <div>
                <span className="text-muted-foreground">identity: </span>
                {user?.id ?? "—"} = {identityLabel}
              </div>
              <div>
                <span className="text-muted-foreground">memory scope (user_id): </span>
                {user?.id ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">memories stored: </span>
                {memoryCount}
              </div>
            </div>
            <div className="rounded-lg border p-3 font-mono text-xs break-all space-y-1">
              <div className="text-muted-foreground">last AI prompt</div>
              {diag ? (
                <>
                  <div>
                    identity sent: {diag.userId} = {diag.displayName ?? "(none)"}
                  </div>
                  <div>memories injected: {diag.memoryCount}</div>
                  <div>thread: {diag.threadId ?? "—"}</div>
                  <div>at: {new Date(diag.at).toLocaleString()}</div>
                  <div>
                    scope match:{" "}
                    {diag.userId === user?.id ? "✅ matches your account" : "❌ mismatch"}
                  </div>
                </>
              ) : (
                <div>No prompt recorded yet — send a message in a chat, then refresh.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Google (read-only)</CardTitle>
            <CardDescription>
              Connect your own account. Hola can read — never write, send, or delete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: "google_mail", label: "Gmail", icon: Mail, scope: "gmail.readonly" },
              { id: "google_sheets", label: "Google Sheets", icon: Sheet, scope: "spreadsheets.readonly" },
            ].map(({ id, label, icon: Icon, scope }) => {
              const s = google(id);
              return (
                <div key={id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground truncate">{scope}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s?.connected ? <Badge variant="secondary">Connected</Badge> : null}
                    {s && !s.configured ? <Badge variant="outline">Setup needed</Badge> : null}
                    {s?.connected ? (
                      <Button variant="outline" size="sm" disabled={busy === id} onClick={() => void disconnect(id)}>
                        <Unplug className="h-4 w-4 mr-1" /> Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy === id || !s?.configured} onClick={() => void connect(id)}>
                        {busy === id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {statuses.some((s) => !s.configured) ? (
              <p className="text-xs text-muted-foreground">
                Google sign-in for each user needs an app-level Google connector client. Ask an admin to
                add it, then Connect appears here.
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                placeholder="Gmail search (optional), e.g. is:unread"
                value={gmailQuery}
                onChange={(e) => setGmailQuery(e.target.value)}
              />
              <Button variant="secondary" disabled={busy === "gmail-run"} onClick={() => void runGmail()}>
                Read latest emails
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="grid gap-2">
                <Input
                  placeholder="Spreadsheet URL or ID"
                  value={sheetRef}
                  onChange={(e) => setSheetRef(e.target.value)}
                />
                <Input
                  placeholder="Range (optional), e.g. Sheet1!A1:D10"
                  value={sheetRange}
                  onChange={(e) => setSheetRange(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={busy === "sheet-run" || !sheetRef.trim()}
                onClick={() => void runSheet()}
              >
                Read sheet
              </Button>
            </div>
            {result ? (
              <pre className="rounded-lg border p-3 text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto">
                {result}
              </pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" /> Telegram
            </CardTitle>
            <CardDescription>
              Run the same read-only Google commands from Telegram: /gmail, /sheet, /status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {telegram.linked ? (
              <div className="flex items-center justify-between gap-2">
                <span>
                  Linked to chat <code className="font-mono">{telegram.chatId}</code>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await unlinkTelegram();
                    await refresh();
                  }}
                >
                  Unlink
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    const { code } = await createTelegramLinkCode();
                    setLinkCode(code);
                  }}
                >
                  Generate link code
                </Button>
                {linkCode ? (
                  <p>
                    Send this to the bot within 15 minutes:{" "}
                    <code className="font-mono rounded bg-muted px-1.5 py-0.5">/link {linkCode}</code>
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
