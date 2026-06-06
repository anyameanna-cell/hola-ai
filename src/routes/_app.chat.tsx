import { createFileRoute } from "@tanstack/react-router";
import { ChatWindow } from "@/components/ChatWindow";

export const Route = createFileRoute("/_app/chat")({
  component: () => <ChatWindow threadId={null} />,
});
