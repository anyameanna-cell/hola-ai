import { createHash, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const updateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    chat: z.object({ id: z.number() }),
    text: z.string().max(4000).optional(),
  }).optional(),
  edited_message: z.object({
    chat: z.object({ id: z.number() }),
    text: z.string().max(4000).optional(),
  }).optional(),
});

function sameSecret(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramKey = process.env.TELEGRAM_API_KEY;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!telegramKey || !lovableKey) return new Response("Integration unavailable", { status: 503 });
        const expected = createHash("sha256").update(`telegram-webhook:${telegramKey}`).digest("base64url");
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!sameSecret(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const parsed = updateSchema.safeParse(await request.json());
        if (!parsed.success) return Response.json({ ok: true, ignored: true });
        const message = parsed.data.message ?? parsed.data.edited_message;
        if (!message?.text) return Response.json({ ok: true, ignored: true });

        const gateway = createLovableAiGatewayProvider(lovableKey);
        const result = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          system: "You are Hola, a warm, concise AI assistant replying in Telegram. Match the user's language. Use simple Markdown-safe text and occasional natural emojis.",
          prompt: message.text,
        });
        const response = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: message.chat.id, text: result.text.slice(0, 4096) }),
        });
        if (!response.ok) return new Response(await response.text(), { status: response.status });
        return Response.json({ ok: true });
      },
    },
  },
});