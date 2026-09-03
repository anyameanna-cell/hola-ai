/**
 * Server-only image generation helpers: intent detection, multi-image support,
 * content-hash caching in storage, and periodic cleanup of old files.
 */

const BUCKET = "generated-images";
const MAX_IMAGES = 4;
const RETENTION_DAYS = 30;
const MAX_FILES = 500;

export interface ImageRequest {
  prompt: string;
  count: number;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, a: 1, an: 1, couple: 2, few: 3,
};

const VERB = /\b(generate|create|draw|make|design|render|paint|produce|sketch|illustrate|show me|give me)\b/i;
const NOUN = /\b(image|images|picture|pictures|pic|pics|photo|photos|photograph|illustration|illustrations|drawing|drawings|artwork|art|painting|paintings|sketch|render|wallpaper|poster|logo|icon|avatar|thumbnail)\b/i;

/** Detect an image request and how many images the user asked for. */
export function detectImageRequest(text: string): ImageRequest | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (!VERB.test(t) || !NOUN.test(t)) return null;

  let count = 1;
  const digit = t.match(/\b(\d{1,2})\s+(?:different\s+|separate\s+|unique\s+)?(?:image|picture|photo|illustration|drawing|artwork|painting|render|variation|version)s?\b/i);
  if (digit) count = parseInt(digit[1]!, 10);
  else {
    const word = t.match(/\b(one|two|three|four|couple|few)\s+(?:of\s+)?(?:different\s+|separate\s+|unique\s+)?(?:image|picture|photo|illustration|drawing|artwork|painting|render|variation|version)s?\b/i);
    if (word) count = NUMBER_WORDS[word[1]!.toLowerCase()] ?? 1;
    else if (/\b(images|pictures|pics|photos|illustrations|drawings|paintings|variations|versions)\b/i.test(t)) count = 2;
  }
  return { prompt: t, count: Math.min(Math.max(count, 1), MAX_IMAGES) };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Returns the app URL if a cached render of this exact prompt already exists. */
async function findCached(name: string): Promise<string | null> {
  try {
    const db = await admin();
    const { data, error } = await db.storage.from(BUCKET).list("", { search: name, limit: 1 });
    if (error) {
      console.warn("[Hola:image] cache lookup failed:", error.message);
      return null;
    }
    if (data?.some((f) => f.name === name)) {
      console.info(`[Hola:image] cache HIT ${name}`);
      return `/api/img/${name}`;
    }
  } catch (err) {
    console.warn("[Hola:image] cache lookup error", err);
  }
  return null;
}

async function storeImage(name: string, b64: string): Promise<string | null> {
  try {
    const db = await admin();
    const bytes = b64ToBytes(b64);
    const { error } = await db.storage
      .from(BUCKET)
      .upload(name, bytes, { contentType: "image/png", upsert: true });
    if (error) {
      console.error(`[Hola:image] upload failed for ${name}: ${error.message}`);
      return null;
    }
    console.info(`[Hola:image] stored ${name} (${Math.round(bytes.length / 1024)}KB)`);
    return `/api/img/${name}`;
  } catch (err) {
    console.error("[Hola:image] upload error", err);
    return null;
  }
}

/** Delete images older than the retention window, and trim the bucket to MAX_FILES. */
export async function cleanupOldImages(): Promise<void> {
  try {
    const db = await admin();
    const { data, error } = await db.storage
      .from(BUCKET)
      .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
    if (error || !data) {
      if (error) console.warn("[Hola:image] cleanup list failed:", error.message);
      return;
    }
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const stale = data.filter((f, i) => {
      const created = f.created_at ? Date.parse(f.created_at) : Date.now();
      return i >= MAX_FILES || created < cutoff;
    });
    if (!stale.length) return;
    const names = stale.map((f) => f.name);
    const { error: delErr } = await db.storage.from(BUCKET).remove(names);
    if (delErr) console.warn("[Hola:image] cleanup delete failed:", delErr.message);
    else console.info(`[Hola:image] cleanup removed ${names.length} old image(s)`);
  } catch (err) {
    console.warn("[Hola:image] cleanup error", err);
  }
}

/** Pull out wording the user wants rendered verbatim on the image. */
export function extractImageText(prompt: string): string[] {
  const out: string[] = [];
  const quoted = prompt.matchAll(/["“”'‘’]([^"“”'‘’]{1,120})["“”'‘’]/g);
  for (const m of quoted) {
    const t = m[1]!.trim();
    if (t) out.push(t);
  }
  if (!out.length) {
    const said = prompt.match(/\b(?:that says|saying|with the (?:text|words|caption|title)|text reads?|write)\s*:?\s*(.{1,120})$/i);
    if (said) out.push(said[1]!.trim().replace(/[.!]+$/, ""));
  }
  return [...new Set(out)].slice(0, 3);
}

/** Add verbatim-typography instructions when the user asked for text on the image. */
export function buildImagePrompt(prompt: string): string {
  const texts = extractImageText(prompt);
  if (!texts.length) return prompt;
  const list = texts.map((t) => `"${t}"`).join(", ");
  return (
    `${prompt}\n\nTypography requirements: render the following text ON the image exactly as written, ` +
    `character for character, with correct spelling and no extra or missing words: ${list}. ` +
    `Use large, crisp, well-kerned lettering with strong contrast against the background so it is fully legible, ` +
    `keep all text inside the frame, and do not add any other words, watermarks, or gibberish lettering.`
  );
}

async function callGateway(prompt: string): Promise<{ b64?: string; url?: string; error?: string }> {

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return { error: "No image provider is configured on the server." };
  const started = Date.now();
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 500);
      console.error(`[Hola:image] gateway ${res.status} after ${Date.now() - started}ms: ${body}`);
      if (res.status === 429) return { error: "Image generation is rate-limited right now. Try again in a moment." };
      if (res.status === 402) return { error: "The image service is busy right now. Please try again in a little while." };
      if (/content|policy|moderat/i.test(body)) return { error: "That image prompt was rejected by the safety filter. Try describing it differently." };
      return { error: "The image service returned an error. Please try again." };
    }
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = json.data?.[0];
    console.info(`[Hola:image] generated in ${Date.now() - started}ms`);
    if (first?.b64_json) return { b64: first.b64_json };
    if (first?.url) return { url: first.url };
    console.error("[Hola:image] gateway returned no image payload");
    return { error: "The image service returned no image. Please try again." };
  } catch (err) {
    console.error("[Hola:image] gateway request failed", err);
    return { error: "Could not reach the image service. Please try again." };
  }
}

/** Generate `count` images for `prompt`; returns app URLs plus a friendly error, if any. */
export async function generateImages(
  prompt: string,
  count = 1,
): Promise<{ urls: string[]; error?: string }> {
  const n = Math.min(Math.max(count, 1), MAX_IMAGES);
  console.info(`[Hola:image] request for ${n} image(s): ${prompt.slice(0, 120)}`);

  const results = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const variantPrompt = n > 1 ? `${prompt}\n\n(Variation ${i + 1} of ${n} — make it visually distinct.)` : prompt;
      const name = `${await sha256Hex(variantPrompt)}.png`;
      const cached = await findCached(name);
      if (cached) return { url: cached };
      const out = await callGateway(buildImagePrompt(variantPrompt));
      if (out.b64) {
        const stored = await storeImage(name, out.b64);
        if (stored) return { url: stored };
        return { error: "The image was generated but could not be saved. Please try again." };
      }
      if (out.url) return { url: out.url };
      return { error: out.error ?? "Image generation failed." };
    }),
  );

  const urls = results.map((r) => r.url).filter((u): u is string => Boolean(u));
  const error = urls.length ? undefined : results.find((r) => r.error)?.error ?? "Image generation failed.";
  if (urls.length) void cleanupOldImages();
  console.info(`[Hola:image] done — ${urls.length}/${n} image(s) ready${error ? ` (error: ${error})` : ""}`);
  return { urls, error };
}
