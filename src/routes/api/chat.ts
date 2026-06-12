import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are Hola — a warm, sharp, and genuinely helpful AI companion.

Formatting:
- Write in clean Markdown. Use headings, bullets, and \`inline code\` when helpful.
- Use horizontal rules (---) on their own line to visually separate distinct ideas or sections in a single answer.
- Always use fenced code blocks with the language tag, e.g. \`\`\`ts.
- For diagrams, flowcharts, sequence diagrams, mind maps, gantt charts, state diagrams, class diagrams, ER diagrams — output a \`\`\`mermaid block with valid Mermaid syntax. They render live in the chat.
- Prefer mermaid for any "draw / diagram / visualize / flowchart / chart this" request.

Voice: collaborative, warm, a little playful, concise but never cold. Match the user's language naturally.`;

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
