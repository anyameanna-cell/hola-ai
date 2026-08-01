import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { HolaLogo } from "@/components/HolaLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hola AI — Personal Assistant" },
      { name: "description", content: "Chat with Hola AI using voice, memory, images, diagrams, and personalized settings." },
      { property: "og:title", content: "Hola AI — Personal Assistant" },
      { property: "og:description", content: "Chat with Hola AI using voice, memory, images, diagrams, and personalized settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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
