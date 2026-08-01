import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HolaLogo } from "@/components/HolaLogo";
import { toast } from "sonner";

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function transcribe(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.wav");
  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!response.ok || !response.body) throw new Error(await response.text().catch(() => "Transcription failed"));
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let transcript = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string; text?: string };
        if (event.type === "transcript.text.delta" && event.delta) transcript += event.delta;
        if (event.type === "transcript.text.done" && event.text) transcript = event.text;
      } catch { /* ignore keep-alive and malformed events */ }
    }
  }
  return transcript.trim();
}

export function CallMode({ onTranscript }: { onTranscript: (text: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const stop = async (send = true) => {
    const stream = streamRef.current;
    const context = contextRef.current;
    const chunks = chunksRef.current;
    stream?.getTracks().forEach((track) => track.stop());
    nodeRef.current?.disconnect(); sourceRef.current?.disconnect();
    if (context) await context.close().catch(() => {});
    streamRef.current = null; contextRef.current = null; nodeRef.current = null; sourceRef.current = null; chunksRef.current = [];
    setListening(false);
    if (!send || !context || chunks.length === 0) return;
    try {
      const next = await transcribe(encodeWav(chunks, context.sampleRate));
      if (!next) throw new Error("I couldn't hear any speech.");
      setText(next);
      await onTranscript(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not transcribe the call");
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const node = context.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      node.onaudioprocess = (event) => chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(node); node.connect(context.destination);
      streamRef.current = stream; contextRef.current = context; sourceRef.current = source; nodeRef.current = node;
      setText(""); setListening(true);
    } catch {
      toast.error("Microphone access is needed to start a call.");
    }
  };

  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  return (
    <>
      <Button type="button" size="icon" variant="ghost" title="Call Hola" aria-label="Call Hola" onClick={() => setOpen(true)} className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground">
        <Mic className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!next && listening) void stop(false); setOpen(next); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Call Hola</DialogTitle>
            <DialogDescription>Speak naturally. Hola will transcribe your turn and reply in chat.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-5 py-6" aria-live="polite">
            <div className={listening ? "animate-pulse" : ""}><HolaLogo size={88} /></div>
            <div className="min-h-12 text-sm text-muted-foreground">{listening ? "Listening… tap Done when you finish." : text || "Ready when you are."}</div>
            {listening ? (
              <Button type="button" onClick={() => void stop(true)}><Volume2 className="h-4 w-4 mr-2" />Done speaking</Button>
            ) : (
              <Button type="button" onClick={() => void start()}><Mic className="h-4 w-4 mr-2" />Start speaking</Button>
            )}
            <Button type="button" variant="ghost" onClick={() => { void stop(false); setOpen(false); }}><PhoneOff className="h-4 w-4 mr-2" />End call</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}