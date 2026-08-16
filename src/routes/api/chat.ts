import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildSystemPrompt, type ChatContext } from "@/lib/chat-prompt";
import { detectImageRequest, generateImages } from "@/lib/image-gen.server";

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

        const imageReq = detectImageRequest(lastText);
        let imageUrls: string[] = [];
        let imageError: string | undefined;
        let imageInjection = "";

        if (imageReq) {
          const out = await generateImages(imageReq.prompt, imageReq.count);
          imageUrls = out.urls;
          imageError = out.error;
          if (imageUrls.length) {
            imageInjection =
              `\n\n## Just-generated image${imageUrls.length > 1 ? "s" : ""}\n` +
              `${imageUrls.length} image${imageUrls.length > 1 ? "s were" : " was"} already generated for this request and will be attached automatically right after your reply. ` +
              `Write ONLY a short, warm caption (1-2 sentences). Do NOT write any markdown image links or URLs yourself — they are appended for you.`;
          } else {
            imageInjection =
              `\n\n## Image generation failed\nTell the user briefly and kindly: "${imageError}" Offer to try again. Do not write any image markdown.`;
          }
        }

        const system = buildSystemPrompt(body.context ?? {}) + imageInjection;
        console.info(
          `[Hola] chat request — model=${modelId}, memories=${(body.context?.memories ?? []).length}, images=${imageUrls.length}`,
        );

        const stream = createUIMessageStream<UIMessage>({
          originalMessages: msgs,
          onError: (err) => {
            console.error("[Hola] chat stream error", err);
            return "Something went wrong generating that reply. Please try again.";
          },
          execute: async ({ writer }) => {
            const result = streamText({
              model: gateway(modelId),
              system,
              messages: await convertToModelMessages(msgs),
            });
            // Hold terminal chunks so the image parts land inside the same message.
            const tail: Parameters<typeof writer.write>[0][] = [];
            for await (const chunk of result.toUIMessageStream<UIMessage>()) {
              if (chunk.type === "finish" || chunk.type === "finish-step") tail.push(chunk);
              else writer.write(chunk);
            }
            if (imageUrls.length) {
              const md =
                "\n\n" +
                imageUrls
                  .map((u, i) => `![generated image${imageUrls.length > 1 ? ` ${i + 1}` : ""}](${u})`)
                  .join("\n\n");
              const id = "hola-images";
              writer.write({ type: "text-start", id });
              writer.write({ type: "text-delta", id, delta: md });
              writer.write({ type: "text-end", id });
            }
            for (const chunk of tail) writer.write(chunk);
          },
        });

        return createUIMessageStreamResponse({ stream });
      },
    },
  },
});
