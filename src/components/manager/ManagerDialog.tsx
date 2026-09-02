import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Lock, Plus, Save, Send, ShieldCheck, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ManagerChat } from "@/components/manager/ManagerChat";
import {
  managerAddStaff,
  managerDeleteDraft,
  managerListDrafts,
  managerListStaff,
  managerListUserEmails,
  managerPublishNotification,
  managerRemoveStaff,
  managerSaveDraft,
  managerSendEmail,
  managerSignIn,
} from "@/lib/manager.functions";
import { toast } from "sonner";

interface Draft {
  id: string;
  path: string;
  content: string;
  note: string | null;
  author_email: string | null;
  updated_at: string;
}

export function ManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [staffEmail, setStaffEmail] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Hola AI Manager
          </DialogTitle>
          <DialogDescription>
            Staff-only console for code changes, announcements and email.
          </DialogDescription>
        </DialogHeader>

        {!staffEmail ? (
          <SignIn
            passcode={passcode}
            setPasscode={setPasscode}
            onSignedIn={(e) => setStaffEmail(e)}
          />
        ) : (
          <Console passcode={passcode} staffEmail={staffEmail} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignIn({
  passcode,
  setPasscode,
  onSignedIn,
}: {
  passcode: string;
  setPasscode: (v: string) => void;
  onSignedIn: (email: string) => void;
}) {
  const signIn = useServerFn(managerSignIn);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await signIn({ data: { passcode } });
      onSignedIn(res.email || "staff");
      toast.success("Welcome to Hola Manager");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-sm space-y-3 rounded-xl border p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4" /> Staff sign in
        </div>
        <p className="text-xs text-muted-foreground">
          Your account email must be on the staff list. Enter the staff passcode to continue.
        </p>
        <Label htmlFor="manager-pass">Passcode</Label>
        <Input
          id="manager-pass"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="••••••••"
        />
        <Button className="w-full" disabled={!passcode || busy} onClick={() => void submit()}>
          {busy ? "Checking…" : "Log in"}
        </Button>
      </div>
    </div>
  );
}

function Console({ passcode, staffEmail }: { passcode: string; staffEmail: string }) {
  return (
    <Tabs defaultValue="haim" className="flex flex-1 flex-col overflow-hidden">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="haim">HAIM</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
        <TabsTrigger value="notify">Notify</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
      </TabsList>

      <TabsContent value="haim" className="flex-1 overflow-hidden">
        <ManagerChat staffEmail={staffEmail} />
      </TabsContent>
      <TabsContent value="code" className="flex-1 overflow-y-auto">
        <CodeTab passcode={passcode} />
      </TabsContent>
      <TabsContent value="notify" className="flex-1 overflow-y-auto">
        <NotifyTab passcode={passcode} />
      </TabsContent>
      <TabsContent value="email" className="flex-1 overflow-y-auto">
        <EmailTab passcode={passcode} />
      </TabsContent>
      <TabsContent value="staff" className="flex-1 overflow-y-auto">
        <StaffTab passcode={passcode} />
      </TabsContent>
    </Tabs>
  );
}

function CodeTab({ passcode }: { passcode: string }) {
  const list = useServerFn(managerListDrafts);
  const save = useServerFn(managerSaveDraft);
  const del = useServerFn(managerDeleteDraft);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState<Partial<Draft>>({ path: "", content: "" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDrafts((await list({ data: { passcode } })) as Draft[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load drafts");
    }
  }, [list, passcode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          passcode,
          id: active.id,
          path: active.path ?? "",
          content: active.content ?? "",
          note: active.note ?? undefined,
        },
      });
      toast.success("Draft saved");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const d of drafts) zip.file(d.path.replace(/^\/+/, ""), d.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hola-code-drafts.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 p-1 md:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setActive({ path: "", content: "" })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
          <Button size="sm" variant="outline" disabled={!drafts.length} onClick={() => void downloadZip()}>
            <Download className="mr-1 h-3.5 w-3.5" /> ZIP
          </Button>
        </div>
        <div className="space-y-1">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-1">
              <button
                onClick={() => setActive(d)}
                className="flex-1 truncate rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent/40"
              >
                {d.path}
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete draft"
                onClick={async () => {
                  await del({ data: { passcode, id: d.id } });
                  await refresh();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {!drafts.length && <p className="text-xs text-muted-foreground">No drafts yet.</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Input
          value={active.path ?? ""}
          onChange={(e) => setActive((a) => ({ ...a, path: e.target.value }))}
          placeholder="src/components/Example.tsx"
        />
        <Textarea
          value={active.content ?? ""}
          onChange={(e) => setActive((a) => ({ ...a, content: e.target.value }))}
          placeholder="Paste or edit the file contents…"
          className="min-h-[300px] font-mono text-xs"
        />
        <Button disabled={busy || !active.path} onClick={() => void onSave()}>
          <Save className="mr-1 h-4 w-4" /> Save draft
        </Button>
      </div>
    </div>
  );
}

function NotifyTab({ passcode }: { passcode: string }) {
  const publish = useServerFn(managerPublishNotification);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const wrap = (tag: string) => setHtml((h) => `${h}<${tag}>text</${tag}>`);

  const send = async () => {
    setBusy(true);
    try {
      const res = await publish({
        data: { passcode, title, html, imageUrl: imageUrl || undefined },
      });
      toast.success(`Published to ${res.sent} people`);
      setTitle("");
      setHtml("");
      setImageUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-1">
      <Label>Title</Label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's new in Hola" />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => wrap("b")}>Bold</Button>
        <Button size="sm" variant="outline" onClick={() => wrap("i")}>Italic</Button>
        <Button size="sm" variant="outline" onClick={() => wrap("u")}>Underline</Button>
        <Button size="sm" variant="outline" onClick={() => wrap("h3")}>Large</Button>
        <Button size="sm" variant="outline" onClick={() => wrap("small")}>Small</Button>
      </div>
      <Textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        className="min-h-[160px] font-mono text-xs"
        placeholder="<b>Hola just got better</b> — new voices and faster images."
      />
      <Label>Image URL (optional)</Label>
      <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      <div className="rounded-lg border p-3">
        <p className="mb-1 text-xs text-muted-foreground">Preview</p>
        <p className="text-sm font-medium">{title || "Untitled"}</p>
        <div className="prose-chat text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <Button disabled={busy || !title.trim() || !html.trim()} onClick={() => void send()}>
        <Send className="mr-1 h-4 w-4" /> Publish to everyone
      </Button>
    </div>
  );
}

function EmailTab({ passcode }: { passcode: string }) {
  const listEmails = useServerFn(managerListUserEmails);
  const sendEmail = useServerFn(managerSendEmail);
  const [emails, setEmails] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listEmails({ data: { passcode } })
      .then((e) => setEmails(e as string[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load users"));
  }, [listEmails, passcode]);

  const toggle = (e: string) =>
    setSelected((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]));

  const send = async () => {
    setBusy(true);
    try {
      const res = await sendEmail({ data: { passcode, to: selected, subject, html } });
      toast.success(`Sent ${res.sent} email(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-1">
      <div className="flex items-center justify-between">
        <Label>Recipients ({selected.length})</Label>
        <Button size="sm" variant="outline" onClick={() => setSelected(selected.length ? [] : emails)}>
          {selected.length ? "Clear" : "Select all"}
        </Button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
        {emails.map((e) => (
          <button
            key={e}
            onClick={() => toggle(e)}
            className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${
              selected.includes(e) ? "bg-accent" : "hover:bg-accent/40"
            }`}
          >
            {e}
          </button>
        ))}
        {!emails.length && <p className="text-xs text-muted-foreground">No users found.</p>}
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <Textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        className="min-h-[160px]"
        placeholder="Email body (HTML allowed)"
      />
      <Button disabled={busy || !selected.length || !subject.trim()} onClick={() => void send()}>
        <Send className="mr-1 h-4 w-4" /> Send
      </Button>
    </div>
  );
}

function StaffTab({ passcode }: { passcode: string }) {
  const list = useServerFn(managerListStaff);
  const add = useServerFn(managerAddStaff);
  const remove = useServerFn(managerRemoveStaff);
  const [staff, setStaff] = useState<{ email: string }[]>([]);
  const [newEmail, setNewEmail] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStaff((await list({ data: { passcode } })) as { email: string }[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load staff");
    }
  }, [list, passcode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-3 p-1">
      <div className="flex gap-2">
        <Input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="new.staff@example.com"
        />
        <Button
          onClick={async () => {
            try {
              await add({ data: { passcode, newEmail } });
              setNewEmail("");
              await refresh();
              toast.success("Staff added");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add");
            }
          }}
          disabled={!newEmail.trim()}
        >
          Add
        </Button>
      </div>
      <div className="space-y-1">
        {staff.map((s) => (
          <div key={s.email} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
            <span className="truncate">{s.email}</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${s.email}`}
              onClick={async () => {
                try {
                  await remove({ data: { passcode, targetEmail: s.email } });
                  await refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not remove");
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
