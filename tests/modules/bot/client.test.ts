import { beforeEach, describe, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis._clientInstance = undefined;
});

describe("client", () => {
  test("creates one shared client using the default session folder", async () => {
    const { default: client } = await import("../../../src/modules/bot/client.ts");
    const { Client } = await import("../../../src/lib/whatsapp.ts");
    expect(client).toBeInstanceOf(Client);
    expect(globalThis._clientInstance).toBe(client);
    expect((client as unknown as { authPath: string }).authPath).toBe(".baileys_auth");
  });

  test("reuses the existing client when the module is loaded again", async () => {
    const first = (await import("../../../src/modules/bot/client.ts")).default;
    vi.resetModules();
    const second = (await import("../../../src/modules/bot/client.ts")).default;
    expect(second).toBe(first);
  });
});
