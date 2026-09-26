import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { groups } from "../../src/lib/constants.ts";
import { sendErrorLog, sendLog } from "../../src/lib/logger.ts";
import client from "../../src/modules/bot/client.ts";
import { fakeChat, fakeMessage } from "../fakes.ts";

beforeEach(() => {
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

describe("sendLog", () => {
  test("posts a blue log with the chat name to the LOG group", async () => {
    const msg = fakeMessage({ chat: fakeChat({ isGroup: true, name: "UniChat" }) });
    await sendLog("AI_MESSAGE", msg);
    expect(client.sendMessage).toHaveBeenCalledExactlyOnceWith(
      groups.LOG,
      expect.stringMatching(/^🔵 .+ \| \*AI_MESSAGE\* for \*UniChat\*$/),
    );
  });

  test("works without a message", async () => {
    await sendLog("Startup", null);
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringMatching(/\*Startup\* for \*\*$/));
  });

  test("does not react to the message", async () => {
    const msg = fakeMessage();
    await sendLog("AI_MESSAGE", msg);
    expect(msg.react).not.toHaveBeenCalled();
  });
});

describe("sendErrorLog", () => {
  test("reacts ❌ and posts a red log to the LOG group", async () => {
    const msg = fakeMessage({ chat: fakeChat({ name: "Ali" }) });
    const error = new Error("boom");
    await sendErrorLog("PDF_HANDLER", msg, error);
    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledExactlyOnceWith(groups.LOG, expect.stringMatching(/^🔴 .+ \| \*PDF_HANDLER\* for \*Ali\*$/));
    expect(Logger.prototype.error).toHaveBeenCalledWith("🔴 PDF_HANDLER for Ali", error);
  });

  test("works without a message", async () => {
    await sendErrorLog("isTeacher", null, new Error("db down"));
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringMatching(/\*isTeacher\* for \*\*$/));
  });
});
