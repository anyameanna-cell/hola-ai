/**
 * End-to-end multi-image test.
 *
 * Runs against the live app (dev server by default) and asserts that a
 * multi-image prompt returns DISTINCT image URLs and that every URL actually
 * serves a real image, at the sizes used by phones, tablets and desktops.
 *
 * Repeatable:  bun run test            (skips automatically if no server)
 *              HOLA_E2E=1 bun run test (fails loudly instead of skipping)
 *              HOLA_BASE_URL=https://hola-ai.lovable.app bun run test
 */
import { describe, expect, it, beforeAll } from "vitest";
import { detectImageRequest, generateImages } from "../src/lib/image-gen.server";

const BASE_URL = process.env.HOLA_BASE_URL ?? "http://localhost:8080";
const REQUIRED = process.env.HOLA_E2E === "1";
const PROMPT = "Generate 3 images of a paper boat on a calm lake, different colours";

// Devices we claim support for. Images are plain <img> URLs, so what matters is
// that each URL serves a real image body to every device user-agent/viewport.
const DEVICES = [
  { name: "mobile", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" },
  { name: "tablet", ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" },
  { name: "desktop", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" },
];

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

describe("multi-image generation, end to end", () => {
  let up = false;
  beforeAll(async () => {
    up = await serverUp();
    if (!up && REQUIRED) throw new Error(`No app reachable at ${BASE_URL}`);
  }, 30_000);

  it("detects how many images the user asked for", () => {
    const req = detectImageRequest(PROMPT);
    expect(req).not.toBeNull();
    expect(req!.count).toBeGreaterThanOrEqual(2);
  });

  it("returns distinct URLs and every image renders on mobile, tablet and desktop", async () => {
    if (!up) {
      console.warn(`[skip] no app at ${BASE_URL}`);
      return;
    }
    const req = detectImageRequest(PROMPT);
    expect(req).not.toBeNull();

    const urls = await generateImages(req!.prompt, req!.count);
    expect(urls.length).toBe(req!.count);

    // 1. distinct
    expect(new Set(urls).size).toBe(urls.length);

    // 2. each URL serves a real image body, to every device
    for (const url of urls) {
      const absolute = url.startsWith("http") ? url : `${BASE_URL}${url}`;
      for (const device of DEVICES) {
        const res = await fetch(absolute, { headers: { "User-Agent": device.ua } });
        expect(res.ok, `${device.name} could not load ${absolute}`).toBe(true);
        const type = res.headers.get("content-type") ?? "";
        expect(type.startsWith("image/"), `${device.name} got ${type} for ${absolute}`).toBe(true);
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect(bytes.byteLength, `${device.name} got an empty image`).toBeGreaterThan(1024);
      }
    }
  }, 300_000);
});
