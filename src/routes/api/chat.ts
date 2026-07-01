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
  messageLength?: "short" | "medium" | "long";
  behavior?: "ai" | "human" | "dramatic" | "normal" | "professional";
}

function lengthGuidance(l?: string): string {
  switch (l) {
    case "short": return "Keep responses SHORT and simple. 1-3 sentences unless the user asks for more. No unnecessary preamble.";
    case "long": return "Give LONG, DETAILED responses. Use headings, bullets, examples, and go deep. Cover edge cases.";
    default: return "Use MEDIUM length: enough detail to be useful, but no filler. Aim for a few short paragraphs.";
  }
}

function behaviorGuidance(b?: string): string {
  switch (b) {
    case "ai": return "Speak like a precise, capable AI assistant. Direct, structured, no small talk, minimal emojis.";
    case "human": return "Sound very human — casual, warm, natural rhythm. Use contractions, occasional interjections (\"oh!\", \"honestly\", \"yeah\"). React with feeling.";
    case "dramatic": return "Be DRAMATIC and expressive! Use CAPS for emphasis on strong words. Bold reactions (\"WOW\", \"absolutely INCREDIBLE\", \"NO way\"). Vivid metaphors. You don't always have to end with a question — sometimes just make a bold statement and let it land. Emojis welcome (✨🔥💫🎭).";
    case "professional": return "Be professional, polished, and precise. Formal but friendly tone. Clear structure. No slang, no emojis.";
    default: return "Warm, sharp, playful when appropriate. Balanced tone. Don't always end with a question — sometimes just answer with confidence.";
  }
}

function buildSystemPrompt(ctx: ChatContext): string {
  const lines: string[] = [
    "You are Hola — a warm, sharp, genuinely helpful AI companion.",
    "",
    "## Style",
    "- " + behaviorGuidance(ctx.behavior),
    "- " + lengthGuidance(ctx.messageLength),
    "- Write in clean Markdown. Use headings, bullets, tables, and `inline code` when helpful.",
    "- Always use fenced code blocks with a language tag (```ts, ```python, ```mermaid).",
    "",
    "## Diagrams",
    "- For any 'draw / diagram / visualize / flowchart / chart this' request, output a ```mermaid block using valid Mermaid v10+ syntax. Avoid double quotes in labels.",
    "",
    "## Images",
    "- If the user asks you to **generate / create / draw / make / design an image, picture, illustration, photo, artwork, poster, wallpaper, or logo**, do NOT refuse. The platform has already generated the image and provides the URL below; embed it exactly as instructed.",
    "",
    "## Ultra Memory (cross-chat)",
    "- You have a long-term memory store shared across ALL of the user's conversations. Existing memories are listed below — use them naturally, DO NOT quote them verbatim, and DO NOT mention the word \"memory\" unless the user brings it up.",
    "- When the user shares a durable fact worth remembering (name, preferences, projects, dates, relationships, goals, dislikes), record it by appending, ONLY at the very end of your reply, on its own line, one hidden HTML comment per new fact in this exact form:",
    "  <!--REMEMBER: short factual statement-->",
    "- These comments are hidden from the user (they are stripped before display). Keep each under 140 chars. Only record NEW facts — do not repeat any already listed below. Skip trivial chit-chat. Never say \"I'll remember that\" out loud; the comment is enough.",
    "",
    "## User context",
  ];
  const name = ctx.displayName?.trim();
  if (name) {
    lines.push(
      `- The user's **current** name is **${name}**. ALWAYS call them ${name} — even if older messages in this thread used a different name, that is outdated. Use ${name} exclusively.`,
    );
  }
  if (ctx.email) lines.push(`- User email: ${ctx.email}`);
  if (ctx.theme || ctx.mode || ctx.fontFamily || ctx.fontSize) {
    lines.push(
      `- Their current UI preferences: theme=${ctx.theme}, mode=${ctx.mode}, font=${ctx.fontFamily}, size=${ctx.fontSize}.`,
    );
  }
  if (ctx.temporary) {
    lines.push("- This is a **temporary chat** — nothing is saved. Do NOT emit any <!--REMEMBER--> comments in this chat.");
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
  lines.push("", "Match the user's language naturally.");
  return lines.join("\n");
}

function detectImagePrompt(text: string): string | null {
  if (!text) return null;
  const m = text.match(
    /\b(?:generate|create|draw|make|design|render|paint|produce|show me)\b[^.?!\n]*\b(?:image|picture|photo|photograph|illustration|drawing|artwork|art|painting|sketch|render|wallpaper|poster|logo|icon)\b[^.?!\n]*/i,
  );
  return m ? text.trim() : null;
}

async function generateImageInline(prompt: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", n: 1 }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
        const first = json.data?.[0];
        const dataUrl = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url ?? null;
        if (dataUrl) return dataUrl;
      }
    } catch { /* fallthrough */ }
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = json.data?.[0];
    return first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url ?? null;
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
          const url = await generateImageInline(imageIntent);
          if (url) {
            imageInjection =
              `\n\n## Just-generated image\n` +
              `An image was already generated for this request. Include this exact markdown near the top of your reply (short caption above it):\n\n` +
              `![generated image](${url})\n`;
          } else {
            imageInjection =
              `\n\n## Image generation\nImage generation failed — apologize briefly and offer to retry with a clearer prompt.`;
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
