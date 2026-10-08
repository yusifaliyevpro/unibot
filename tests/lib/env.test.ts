import { beforeEach, describe, expect, test, vi } from "vitest";

const loadEnv = async () => await import("../../src/lib/env.ts");

beforeEach(() => {
  vi.resetModules();
  // env.ts prints the validation errors before throwing
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("ENV", () => {
  test("exposes the validated variables", async () => {
    const { ENV } = await loadEnv();
    expect(ENV).toMatchObject({
      OPENROUTER_API_KEY: "test-openrouter-key",
      UNICHAT_GROUP_ID: "111111111111111111@g.us",
    });
  });

  test("trims values", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "   padded-key   ");
    const { ENV } = await loadEnv();
    expect(ENV.OPENROUTER_API_KEY).toBe("padded-key");
  });

  test.for(["DATABASE_URL", "GOOGLE_TOKEN", "ADOBE_CLIENT_SECRET", "FINAL_EXAM_GROUP_ID"])("rejects a missing %s", async (name) => {
    vi.stubEnv(name, undefined);
    await expect(loadEnv()).rejects.toThrow("Environment Variables");
    expect(console.log).toHaveBeenCalledWith(expect.objectContaining({ [name]: expect.any(Array) }));
  });

  test("rejects values shorter than 3 characters after trimming", async () => {
    vi.stubEnv("STICKER_BASE_URL", "  ab  ");
    await expect(loadEnv()).rejects.toThrow("Environment Variables");
  });
});
