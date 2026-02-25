import { describe, it, expect } from "vitest";
import { apiFetch } from "@/lib/api-server";

describe("apiFetch", () => {
  it("returns null on network error (localhost not running)", async () => {
    const result = await apiFetch("/api/stats", 0);
    expect(result).toBeNull();
  });

  it("accepts custom revalidate parameter", async () => {
    // Mainly tests that the function signature works
    const result = await apiFetch("/api/nonexistent", 300);
    expect(result).toBeNull();
  });
});
