import { vi } from "vitest";

// Never load the real .env into tests, the fake values come from vitest.config.ts
vi.mock(import("dotenv"), async (importOriginal) => {
  const actual = await importOriginal();
  const config = vi.fn(() => ({ parsed: {} }));
  return { ...actual, config, default: { ...actual.default, config } };
});
