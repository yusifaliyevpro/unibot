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
      TZ: "Asia/Baku",
      OPENROUTER_API_KEY: "test-openrouter-key",
      UNICHAT_GROUP_ID: "111111111111111111@g.us",
    });
  });

  test("trims values", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "   padded-key   ");
    const { ENV } = await loadEnv();
    expect(ENV.OPENROUTER_API_KEY).toBe("padded-key");
  });

  test("rejects a timezone other than Asia/Baku", async () => {
    vi.stubEnv("TZ", "UTC");
    await expect(loadEnv()).rejects.toThrow("Environment Variables");
  });

  test.for(["DATABASE_URL", "GOOGLE_TOKEN", "ADOBE_CLIENT_SECRET", "FINAL_EXAM_GROUP_ID"])("rejects a missing %s", async (name) => {
    vi.stubEnv(name, undefined);
    await expect(loadEnv()).rejects.toThrow("Environment Variables");
    expect(console.log).toHaveBeenCalledWith(expect.objectContaining({ [name]: expect.any(Array) }));
  });

  test("PUBLIC_BASE_URL is optional", async () => {
    const { ENV } = await loadEnv();
    expect(ENV.PUBLIC_BASE_URL).toBeUndefined();
  });

  test("accepts an https PUBLIC_BASE_URL", async () => {
    vi.stubEnv("PUBLIC_BASE_URL", "https://unibot.example.com");
    const { ENV } = await loadEnv();
    expect(ENV.PUBLIC_BASE_URL).toBe("https://unibot.example.com");
  });

  // The sticker generator only downloads images over https
  test.for(["http://1.2.3.4:3000", "localhost:3000"])("rejects PUBLIC_BASE_URL %j", async (url) => {
    vi.stubEnv("PUBLIC_BASE_URL", url);
    await expect(loadEnv()).rejects.toThrow("Environment Variables");
  });

  test("rejects values shorter than 3 characters after trimming", async () => {
    vi.stubEnv("STICKER_BASE_URL", "  ab  ");
    await expect(loadEnv()).rejects.toThrow("Environment Variables");
  });
});
