import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Trash2, LogOut, MessageSquare, Pencil, Check, X, Ghost, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HolaLogo } from "@/components/HolaLogo";
import { SettingsButton } from "@/components/SettingsDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Thread {
  id: string;
  title: string;
  updated_at: string;
}

function bucketOf(iso: string): "Today" | "Yesterday" | "Last 7 days" | "Older" {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Last 7 days";
  return "Older";
}

const BUCKETS = ["Today", "Yesterday", "Last 7 days", "Older"] as const;

export function ChatSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (b: string) => setCollapsed((c) => ({ ...c, [b]: !c[b] }));

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return;
    setThreads((data ?? []) as Thread[]);
  };

  useEffect(() => {
    load();
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      setDisplayName(data?.display_name ?? null);
    });
    const onChange = () => load();
    window.addEventListener("hola:threads-changed", onChange);
    const channel = supabase
      .channel("threads-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    const profileChannel = supabase
      .channel("profile-self")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDisplayName((p.new as any)?.display_name ?? null);
      })
      .subscribe();
    return () => {
      window.removeEventListener("hola:threads-changed", onChange);
      supabase.removeChannel(channel);
      supabase.removeChannel(profileChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleDelete = async (id: string) => {
    // Optimistic removal
    setThreads((ts) => ts.filter((t) => t.id !== id));
    if (activeId === id) navigate({ to: "/chat" });
    const { error } = await supabase.from("threads").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete");
      load();
      return;
    }
    toast.success("Conversation deleted");
  };

  const startEdit = (t: Thread) => {
    setEditingId(t.id);
    setEditValue(t.title);
  };

  const saveEdit = async (id: string) => {
    const title = editValue.trim().slice(0, 80);
    if (!title) { setEditingId(null); return; }
    setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t)));
    setEditingId(null);
    const { error } = await supabase.from("threads").update({ title }).eq("id", id);
    if (error) { toast.error("Could not rename"); load(); }
  };

  const grouped: Record<string, Thread[]> = {};
  for (const t of threads) {
    const b = bucketOf(t.updated_at);
    (grouped[b] ||= []).push(t);
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <HolaLogo size={28} />
          <div className="font-semibold tracking-tight">Hola</div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-1 mx-1 mt-2">
          <Button asChild className="bg-brand-gradient text-white border-0 shadow-brand">
            <Link to="/chat"><Plus className="h-4 w-4 mr-1" /> New chat</Link>
          </Button>
          <Button asChild variant="outline" size="icon" title="Temporary chat (nothing saved)">
            <Link to="/chat" search={{ temp: "1" }}><Ghost className="h-4 w-4" /></Link>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {BUCKETS.map((b) => {
          const items = grouped[b];
          if (!items?.length) return null;
          const isClosed = collapsed[b];
          return (
            <SidebarGroup key={b}>
              <button
                onClick={() => toggle(b)}
                className="flex items-center w-full text-left px-2 py-1 hover:bg-accent/50 rounded"
              >
                <ChevronRight className={cn("h-3.5 w-3.5 mr-1 transition-transform", !isClosed && "rotate-90")} />
                <SidebarGroupLabel className="!p-0 !h-auto cursor-pointer">{b}</SidebarGroupLabel>
                <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
              </button>
              {!isClosed && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((t) => (
                      <SidebarMenuItem key={t.id}>
                        {editingId === t.id ? (
                          <div className="flex items-center gap-1 px-1 py-0.5">
                            <Input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(t.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="h-7 text-sm"
                            />
                            <button onClick={() => saveEdit(t.id)} className="p-1 rounded hover:bg-accent" aria-label="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-accent" aria-label="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-1 pr-1">
                            <SidebarMenuButton asChild isActive={activeId === t.id} className="flex-1">
                              <Link to="/c/$threadId" params={{ threadId: t.id }}>
                                <MessageSquare className="h-4 w-4" />
                                <span className="truncate">{t.title}</span>
                              </Link>
                            </SidebarMenuButton>
                            <button
                              aria-label="Rename"
                              onClick={() => startEdit(t)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground transition"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              aria-label="Delete"
                              onClick={() => handleDelete(t.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
        {threads.length === 0 && (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            No conversations yet. Start a new chat!
          </div>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{displayName ?? user?.user_metadata?.full_name ?? user?.email}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <SettingsButton />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
