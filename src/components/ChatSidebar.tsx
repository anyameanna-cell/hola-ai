import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Trash2, LogOut, MessageSquare } from "lucide-react";
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
import { HolaLogo } from "@/components/HolaLogo";
import { toast } from "sonner";

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
    const channel = supabase
      .channel("threads-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("threads").delete().eq("id", id);
    if (error) { toast.error("Could not delete"); return; }
    if (activeId === id) navigate({ to: "/chat" });
    toast.success("Conversation deleted");
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
        <Button asChild className="bg-brand-gradient text-white border-0 shadow-brand mt-2 mx-1">
          <Link to="/chat"><Plus className="h-4 w-4 mr-1" /> New chat</Link>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {BUCKETS.map((b) => {
          const items = grouped[b];
          if (!items?.length) return null;
          return (
            <SidebarGroup key={b}>
              <SidebarGroupLabel>{b}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((t) => (
                    <SidebarMenuItem key={t.id}>
                      <div className="group flex items-center gap-1 pr-1">
                        <SidebarMenuButton asChild isActive={activeId === t.id} className="flex-1">
                          <Link to="/c/$threadId" params={{ threadId: t.id }}>
                            <MessageSquare className="h-4 w-4" />
                            <span className="truncate">{t.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        <button
                          aria-label="Delete"
                          onClick={() => handleDelete(t.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
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
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.user_metadata?.full_name ?? user?.email}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
