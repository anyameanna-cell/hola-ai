import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/lib/chat-prompt";

describe("chat prompt settings", () => {
  it("injects username, message length, behavior, and memories", () => {
    const prompt = buildSystemPrompt({ displayName: "Maya", messageLength: "short", behavior: "dramatic", memories: ["The user has a cat named Pico"] });
    expect(prompt).toContain("ALWAYS call them Maya");
    expect(prompt).toContain("Keep responses SHORT and simple");
    expect(prompt).toContain("Be DRAMATIC");
    expect(prompt).toContain("The user has a cat named Pico");
  });

  it("prevents memory writes in temporary chats", () => {
    expect(buildSystemPrompt({ temporary: true })).toContain("Do NOT emit any <!--REMEMBER--> comments");
  });
});