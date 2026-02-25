import { describe, it, expect } from "vitest";
import { sha256 } from "@/lib/edge-crypto";

describe("sha256", () => {
  it("returns a 64-char hex string", async () => {
    const h = await sha256("hello");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces correct SHA-256 hash for known input", async () => {
    // SHA-256 of "hello" is well-known
    const h = await sha256("hello");
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("produces different hashes for different inputs", async () => {
    const a = await sha256("alice");
    const b = await sha256("bob");
    expect(a).not.toBe(b);
  });

  it("is deterministic", async () => {
    const h1 = await sha256("deterministic-test");
    const h2 = await sha256("deterministic-test");
    expect(h1).toBe(h2);
  });

  it("handles empty string", async () => {
    const h = await sha256("");
    expect(h).toHaveLength(64);
    expect(h).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("handles unicode", async () => {
    const h = await sha256("hello world \u{1F916}\u{2764}");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
