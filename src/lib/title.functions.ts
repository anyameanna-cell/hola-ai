import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export const generateThreadTitle = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const i = input as { userMessage?: string; assistantMessage?: string };
    if (!i?.userMessage) throw new Error("userMessage required");
    return {
      userMessage: String(i.userMessage).slice(0, 2000),
      assistantMessage: String(i.assistantMessage ?? "").slice(0, 2000),
    };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "Generate a 3-6 word title summarizing the conversation. Output ONLY the title text — no quotes, no punctuation at the end, no prefix like 'Title:'.",
      prompt: `User: ${data.userMessage}\n\nAssistant: ${data.assistantMessage}\n\nTitle:`,
    });
    return { title: text.trim().replace(/^["']|["']$/g, "").slice(0, 80) || "New chat" };
  });
