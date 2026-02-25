import { vi } from "vitest";

process.env.TURSO_DATABASE_URL = "file:./data/test.db";
process.env.TURSO_AUTH_TOKEN = "";
process.env.REVALIDATE_SECRET = "test_secret";

// @libsql/client/web is HTTP-only; redirect to native client for local file DB
vi.mock("@libsql/client/web", async () => {
  return await import("@libsql/client");
});
