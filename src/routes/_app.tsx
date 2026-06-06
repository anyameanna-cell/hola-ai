import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { HolaLogo } from "@/components/HolaLogo";
import { SettingsButton } from "@/components/SettingsDialog";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <HolaLogo size={56} />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <ChatSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 flex items-center justify-between border-b px-3 sticky top-0 bg-background/80 backdrop-blur z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <HolaLogo size={24} />
                <span className="font-semibold tracking-tight">Hola</span>
              </div>
            </div>
            <SettingsButton />
          </header>
          <main className="flex-1 flex flex-col min-h-0">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
