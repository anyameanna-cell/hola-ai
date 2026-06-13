import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

interface ChatContext {
  displayName?: string;
  email?: string;
  theme?: string;
  mode?: string;
  fontFamily?: string;
  fontSize?: string;
  temporary?: boolean;
  recentChats?: { title: string; snippet?: string }[];
}

function buildSystemPrompt(ctx: ChatContext): string {
  const lines: string[] = [
    "You are Hola — a warm, sharp, genuinely helpful AI companion. A little playful, never cold.",
    "",
    "## Formatting",
    "- Write in clean Markdown. Use headings, bullets, tables, and `inline code` when helpful.",
    "- Use horizontal rules (---) on their own line to separate distinct ideas in one answer.",
    "- Always use fenced code blocks with the language tag, e.g. ```ts.",
    "- Use emojis naturally where they add warmth or clarity (✨🎯💡🚀) — don't overdo it.",
    "",
    "## Diagrams",
    "- For any 'draw / diagram / visualize / flowchart / chart this' request, output a ```mermaid block.",
    "- Use valid Mermaid v10+ syntax. Common gotchas to AVOID:",
    "  - Do NOT use double quotes inside node labels — escape with &quot; or rewrite.",
    "  - Use simple labels: `A[Question?]` not `A[Question?? & weird]`.",
    "  - For flowcharts use `graph TD` or `graph LR`.",
    "  - Always end edge labels cleanly: `A -->|label| B`, never trailing spaces.",
    "- Prefer mermaid for any visualization request.",
    "",
    "## Memory & user context",
  ];
  const name = ctx.displayName?.trim();
  if (name) lines.push(`- The user's name is **${name}**. Address them by name occasionally — naturally, not every message.`);
  if (ctx.email) lines.push(`- User email: ${ctx.email}`);
  if (ctx.theme || ctx.mode || ctx.fontFamily || ctx.fontSize) {
    lines.push(
      `- Their current UI preferences: theme=${ctx.theme}, mode=${ctx.mode}, font=${ctx.fontFamily}, size=${ctx.fontSize}. ` +
        `You may reference these if relevant (e.g. recommending a dark-mode-friendly color).`,
    );
  }
  if (ctx.temporary) {
    lines.push("- This is a **temporary chat** — nothing is being saved. You can mention this if relevant.");
  }
  if (ctx.recentChats?.length) {
    lines.push("- Recent past conversations with this user (for continuity — reference only if directly relevant):");
    for (const c of ctx.recentChats.slice(0, 8)) {
      lines.push(`  • "${c.title}"${c.snippet ? ` — ${c.snippet}` : ""}`);
    }
  }
  lines.push("", "Match the user's language naturally. Be concise but never cold.");
  return lines.join("\n");
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          messages?: unknown;
          model?: string;
          context?: ChatContext;
        };
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const modelId =
          typeof body.model === "string" && body.model
            ? body.model
            : "google/gemini-3-flash-preview";

        const result = streamText({
          model: gateway(modelId),
          system: buildSystemPrompt(body.context ?? {}),
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
