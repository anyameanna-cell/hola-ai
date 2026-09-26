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

const HELP = [
  "🤖 *Hola commands*",
  "",
  "/link CODE — connect this chat to your Hola account (get the code in Hola → Connections)",
  "/status — show which Google services are connected",
  "/gmail [search words] — read-only: your latest emails",
  "/sheet <spreadsheet id or url> [Tab!A1:D10] — read-only: sheet values",
  "/unlink — disconnect this chat",
  "",
  "Anything else is just a normal chat with me 💜",
].join("\n");

async function resolveUser(chatId: number): Promise<{ userId: string; displayName: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  const userId = data.user_id as string;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return { userId, displayName: (profile?.display_name as string) || userId };
}

async function handleCommand(chatId: number, text: string): Promise<string | null> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = (rawCmd ?? "").toLowerCase().replace(/@.*$/, "");
  const arg = rest.join(" ").trim();
  if (!cmd.startsWith("/")) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (cmd === "/start" || cmd === "/help") return HELP;

  if (cmd === "/link") {
    if (!arg) return "⚠️ Usage: /link CODE — generate a code in Hola → Connections.";
    const { data } = await supabaseAdmin
      .from("telegram_link_codes")
      .select("user_id, expires_at")
      .eq("code", arg.toUpperCase())
      .maybeSingle();
    if (!data) return "❌ That code isn't valid. Generate a new one in Hola → Connections.";
    if (new Date(data.expires_at as string).getTime() < Date.now()) {
      return "⏰ That code expired. Generate a fresh one in Hola → Connections.";
    }
    await supabaseAdmin
      .from("telegram_links")
      .upsert({ telegram_chat_id: chatId, user_id: data.user_id }, { onConflict: "telegram_chat_id" });
    await supabaseAdmin.from("telegram_link_codes").delete().eq("code", arg.toUpperCase());
    const who = await resolveUser(chatId);
    return `✅ Linked! This chat now acts as *${who?.displayName ?? "your account"}*.\nTry /status`;
  }

  if (cmd === "/unlink") {
    await supabaseAdmin.from("telegram_links").delete().eq("telegram_chat_id", chatId);
    return "✅ This chat is no longer linked to a Hola account.";
  }

  const who = await resolveUser(chatId);
  if (cmd === "/status") {
    if (!who) return "🔌 Not linked yet. Use /link CODE with a code from Hola → Connections.";
    const { clientApiKeyFor } = await import("@/server/googleActions.server");
    const { listConnectedConnectors } = await import("@/server/appUserConnections.server");
    const connected = await listConnectedConnectors(who.userId);
    const line = (id: string, label: string) =>
      `${connected.includes(id) ? "✅" : clientApiKeyFor(id) ? "⚪️" : "🚧"} ${label}${
        clientApiKeyFor(id) ? "" : " (not set up in the app yet)"
      }`;
    return [
      `👤 Account: *${who.displayName}*`,
      `🆔 user_id: \`${who.userId}\``,
      line("google_mail", "Gmail (read-only)"),
      line("google_sheets", "Google Sheets (read-only)"),
    ].join("\n");
  }

  if (cmd === "/gmail" || cmd === "/sheet" || cmd === "/sheets") {
    if (!who) return "🔌 Not linked yet. Use /link CODE with a code from Hola → Connections.";
    const {
      gmailRecent,
      sheetsInfo,
      sheetsRead,
      extractSpreadsheetId,
      formatGmailForText,
      formatSheetValuesForText,
      GoogleActionError,
    } = await import("@/server/googleActions.server");
    try {
      if (cmd === "/gmail") {
        const items = await gmailRecent(who.userId, { query: arg || undefined, limit: 5 });
        return `📬 *Gmail — read-only*${arg ? ` (search: ${arg})` : ""}\n\n${formatGmailForText(items)}`;
      }
      if (!arg) return "⚠️ Usage: /sheet <spreadsheet id or url> [Tab!A1:D10]";
      const [ref, ...rangeParts] = arg.split(/\s+/);
      const id = extractSpreadsheetId(ref ?? "");
      const info = await sheetsInfo(who.userId, id);
      const range = rangeParts.join(" ") || `${info.tabs[0] ?? "Sheet1"}!A1:F20`;
      const values = await sheetsRead(who.userId, id, range);
      return `📊 *${info.title}* — read-only\nRange: ${values.range}\n\n\`\`\`\n${formatSheetValuesForText(values.values)}\n\`\`\``;
    } catch (error) {
      if (error instanceof GoogleActionError) {
        if (error.code === "not_configured") return "🚧 Google access isn't set up in the app yet.";
        if (error.code === "not_connected")
          return "🔐 That Google service isn't connected yet. Open Hola → Connections and connect it (read-only).";
      }
      return `❌ Couldn't fetch that: ${(error as Error).message.slice(0, 300)}`;
    }
  }

  return `🤔 Unknown command.\n\n${HELP}`;
}

async function sendTelegram(lovableKey: string, telegramKey: string, chatId: number, text: string) {
  return fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), parse_mode: "Markdown" }),
  });
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

        let reply: string;
        try {
          const commandReply = await handleCommand(message.chat.id, message.text);
          if (commandReply) {
            reply = commandReply;
          } else {
            const gateway = createLovableAiGatewayProvider(lovableKey);
            const result = await generateText({
              model: gateway("google/gemini-3-flash-preview"),
              system:
                "You are Hola, a warm, concise AI assistant replying in Telegram. Match the user's language. Use simple Markdown-safe text and occasional natural emojis. If the user asks about their email or spreadsheets, tell them to use /gmail or /sheet.",
              prompt: message.text,
            });
            reply = result.text;
          }
        } catch (error) {
          console.error("[Hola][telegram]", error);
          reply = "❌ Something went wrong on my side. Please try again in a moment.";
        }

        const response = await sendTelegram(lovableKey, telegramKey, message.chat.id, reply);
        if (!response.ok) return new Response(await response.text(), { status: response.status });
        return Response.json({ ok: true });
      },
    },
  },
});
