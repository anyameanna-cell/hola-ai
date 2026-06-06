import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are Hola — a warm, sharp, and genuinely helpful AI companion.
You write in clean Markdown. Use headings, bullets, and \`code\` when helpful.
Use thematic breaks (---) to separate distinct ideas. When showing code, always use fenced code blocks with the language tag.
Match the user's language naturally. Be concise but never cold — you're collaborative, a little playful, never robotic.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { messages?: unknown; model?: string };
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const modelId = typeof body.model === "string" && body.model ? body.model : "google/gemini-3-flash-preview";

        const result = streamText({
          model: gateway(modelId),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
