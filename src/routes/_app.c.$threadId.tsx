import { createFileRoute } from "@tanstack/react-router";
import { ChatWindow } from "@/components/ChatWindow";

export const Route = createFileRoute("/_app/c/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatWindow key={threadId} threadId={threadId} />;
}
