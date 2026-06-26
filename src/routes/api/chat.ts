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
  memories?: string[];
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
    "- Use valid Mermaid v10+ syntax. Avoid double quotes in node labels.",
    "",
    "## Images",
    "- If the user clearly asks you to **generate / create / draw / make / design an image, picture, illustration, photo, or artwork**, you must not refuse. The platform auto-generates the image for you before you reply — the URL is provided below in the context.",
    "",
    "## Ultra Memory (cross-chat)",
    "- You have a long-term memory store shared across ALL the user's conversations.",
    "- Existing memories are listed below. Reference them naturally when relevant.",
    "- Whenever the user shares a durable fact about themselves (name, preferences, projects, important dates, relationships, goals, dislikes, etc.) that would be useful in future chats, append at the end of your message one HTML comment per fact, in this exact format on its own line:",
    "  <!--REMEMBER: short factual statement-->",
    "- Keep each remember note concise (under 140 chars), factual, and self-contained. Don't remember trivial chit-chat. Don't repeat facts that are already in the memory list.",
    "",
    "## User context",
  ];
  const name = ctx.displayName?.trim();
  if (name) {
    lines.push(
      `- The user's **current** name is **${name}**. Always call them ${name}. ` +
        "If older messages in this thread used a different name, that is outdated — ignore it and use the current name.",
    );
  }
  if (ctx.email) lines.push(`- User email: ${ctx.email}`);
  if (ctx.theme || ctx.mode || ctx.fontFamily || ctx.fontSize) {
    lines.push(
      `- Their current UI preferences: theme=${ctx.theme}, mode=${ctx.mode}, font=${ctx.fontFamily}, size=${ctx.fontSize}.`,
    );
  }
  if (ctx.temporary) {
    lines.push("- This is a **temporary chat** — nothing is being saved (memories will not be stored either).");
  }
  if (ctx.memories?.length) {
    lines.push("", "## Long-term memories about this user");
    for (const m of ctx.memories.slice(0, 60)) lines.push(`- ${m}`);
  }
  if (ctx.recentChats?.length) {
    lines.push("", "## Recent past conversations (for continuity)");
    for (const c of ctx.recentChats.slice(0, 8)) {
      lines.push(`- "${c.title}"${c.snippet ? ` — ${c.snippet}` : ""}`);
    }
  }
  lines.push("", "Match the user's language naturally. Be concise but never cold.");
  return lines.join("\n");
}

function detectImagePrompt(text: string): string | null {
  if (!text) return null;
  const m = text.match(
    /\b(?:generate|create|draw|make|design|render|paint|produce|show me)\b[^.?!\n]*\b(?:image|picture|photo|photograph|illustration|drawing|artwork|art|painting|sketch|render|wallpaper|poster|logo|icon)\b[^.?!\n]*/i,
  );
  return m ? text.trim() : null;
}

async function tryGenerateImage(prompt: string, origin: string): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/api/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!r.ok) return null;
    const { url } = (await r.json()) as { url?: string };
    return url ?? null;
  } catch {
    return null;
  }
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

        // Detect "make me an image" intent on the latest user message and pre-generate.
        const msgs = body.messages as UIMessage[];
        const lastUser = [...msgs].reverse().find((m) => m.role === "user");
        const lastText =
          lastUser?.parts
            ?.map((p) => (p.type === "text" ? p.text : ""))
            .join("")
            .trim() ?? "";
        const imageIntent = detectImagePrompt(lastText);
        let imageInjection = "";
        if (imageIntent) {
          const origin = new URL(request.url).origin;
          const url = await tryGenerateImage(imageIntent, origin);
          if (url) {
            imageInjection =
              `\n\n## Just-generated image for this request\n` +
              `An image was already generated for the user's request. Include this exact markdown in your reply (with a short caption above it):\n\n` +
              `![generated image](${url})\n`;
          } else {
            imageInjection =
              `\n\n## Image generation\nImage generation failed this time — apologize briefly and offer to retry with a clearer prompt.`;
          }
        }

        const system = buildSystemPrompt(body.context ?? {}) + imageInjection;

        const result = streamText({
          model: gateway(modelId),
          system,
          messages: await convertToModelMessages(msgs),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: msgs,
        });
      },
    },
  },
});
