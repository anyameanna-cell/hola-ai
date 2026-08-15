import { createFileRoute } from "@tanstack/react-router";
import { ChatWindow } from "@/components/ChatWindow";

export const Route = createFileRoute("/_app/c/$threadId")({
  validateSearch: (search: Record<string, unknown>): { temp?: "1" } =>
    search.temp === "1" || search.temp === true ? { temp: "1" } : {},
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { temp } = Route.useSearch();
  return <ChatWindow key={threadId} threadId={threadId} temporary={temp === "1"} />;
}
