import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildSystemPrompt, type ChatContext } from "@/lib/chat-prompt";

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
        console.info(`[Hola] Injecting ${(body.context?.memories ?? []).length} global memories for this request.`);

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
