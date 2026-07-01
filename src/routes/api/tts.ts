import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice, speed } = (await request.json()) as { text?: string; voice?: string; speed?: number };
        if (!text || typeof text !== "string") {
          return new Response("text required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        // Strip markdown so TTS reads only the spoken content (avoids skipped intros).
        const clean = text
          .replace(/<!--[\s\S]*?-->/g, " ")
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/`[^`]*`/g, " ")
          .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .replace(/^#+\s*/gm, "")
          .replace(/[*_>#~]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 4000);

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: clean,
            voice: voice || "shimmer",
            instructions:
              "Speak as a gentle, warm, young woman. Soft, friendly, calm pacing. Begin clearly from the very first word.",
            speed: typeof speed === "number" && speed >= 0.5 && speed <= 2 ? speed : 1.0,
            response_format: "mp3",
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return new Response(txt || "TTS failed", { status: res.status });
        }
        // Buffer to a complete blob so the browser can play from sample 0 reliably.
        const buf = await res.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(buf.byteLength),
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
