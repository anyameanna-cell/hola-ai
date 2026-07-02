import { describe, expect, it } from "vitest";
import { extractMemoryComments, extractUserMemoryRequests, getFreshMemories, stripMemoryComments } from "../src/lib/memory";

describe("Ultra Memory", () => {
  it("never displays hidden REMEMBER comments in chat", () => {
    const visible = stripMemoryComments("Okay.\n<!--REMEMBER: The user likes mango tea.-->\nDone.");
    expect(visible).toBe("Okay.\nDone.");
    expect(visible).not.toContain("REMEMBER");
    expect(visible).not.toContain("<!--");
  });

  it("extracts and dedupes hidden memory comments", () => {
    expect(extractMemoryComments("<!--REMEMBER: Likes blue.-->\n<!-- remember: likes blue -->")).toEqual(["Likes blue."]);
  });

  it("dedupes new memories against existing memories", () => {
    expect(getFreshMemories(["The user likes blue"], ["the user likes blue.", "The user prefers short answers"])).toEqual(["The user prefers short answers"]);
  });

  it("captures explicit memory requests without model comments", () => {
    expect(extractUserMemoryRequests("Remember that my dog is called Luna")).toEqual(["my dog is called Luna"]);
  });
});