import { createFileRoute } from "@tanstack/react-router";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav"]);

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Speech transcription is unavailable", { status: 500 });

        const incoming = await request.formData();
        const audio = incoming.get("file");
        if (!(audio instanceof File) || audio.size < 2048) {
          return new Response("That recording was empty — please try again.", { status: 400 });
        }
        if (audio.size > MAX_AUDIO_BYTES) return new Response("Recording is too large", { status: 413 });
        if (!ALLOWED_AUDIO_TYPES.has(audio.type.split(";")[0] ?? "")) {
          return new Response("Only WAV microphone audio is accepted", { status: 415 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", audio, "recording.wav");
        upstream.append("stream", "true");

        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        if (!response.ok) {
          return new Response(await response.text().catch(() => "Transcription failed"), { status: response.status });
        }
        return new Response(response.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
      },
    },
  },
});