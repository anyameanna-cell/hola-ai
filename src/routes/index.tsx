import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { HolaLogo } from "@/components/HolaLogo";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <HolaLogo size={56} />
      </div>
    );
  }
  return <Navigate to={user ? "/chat" : "/auth"} replace />;
}
