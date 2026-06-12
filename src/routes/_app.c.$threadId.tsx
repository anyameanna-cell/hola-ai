import { createFileRoute } from "@tanstack/react-router";
import { ChatWindow } from "@/components/ChatWindow";

export const Route = createFileRoute("/_app/c/$threadId")({
  validateSearch: (search: Record<string, unknown>) => ({
    temp: search.temp === "1" || search.temp === true ? ("1" as const) : undefined,
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { temp } = Route.useSearch();
  return <ChatWindow key={threadId} threadId={threadId} temporary={temp === "1"} />;
}
