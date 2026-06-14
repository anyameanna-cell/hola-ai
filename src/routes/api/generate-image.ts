import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt || typeof prompt !== "string") {
          return new Response("prompt required", { status: 400 });
        }
        const key = process.env.OPENAI_API_KEY;
        if (!key) return new Response("Missing OPENAI_API_KEY", { status: 500 });

        const res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt,
            size: "1024x1024",
            n: 1,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return new Response(txt || "Image generation failed", { status: res.status });
        }
        const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
        const first = json.data?.[0];
        const dataUrl = first?.b64_json
          ? `data:image/png;base64,${first.b64_json}`
          : first?.url ?? null;
        if (!dataUrl) return new Response("No image returned", { status: 500 });
        return Response.json({ url: dataUrl });
      },
    },
  },
});
