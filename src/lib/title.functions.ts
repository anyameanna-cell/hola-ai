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
    // Local fallback so a chat always gets a usable name, even if the AI
    // service is unavailable (rate limited, out of allowance, etc.).
    const fallback = () => {
      const words = data.userMessage.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
      return { title: (words || "New chat").slice(0, 40) };
    };

    const key = process.env.LOVABLE_API_KEY;
    if (!key) return fallback();

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "Create a SHORT 2-4 word title for this conversation. Use simple, everyday words a child would understand. No jargon, no fancy vocabulary, no quotes, no punctuation at the end, no 'Title:' prefix. Just the plain title.",
        prompt: `User: ${data.userMessage}\n\nAssistant: ${data.assistantMessage}\n\nTitle:`,
      });
      const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 40);
      return title ? { title } : fallback();
    } catch (err) {
      console.error("[title] generation failed, using fallback:", err);
      return fallback();
    }
  });

