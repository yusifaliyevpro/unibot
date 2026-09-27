import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { groups } from "../../../../src/lib/constants.ts";
import { adminHelpbox, helpBox, helpBoxAZ, universityHelpbox } from "../../../../src/lib/messages.ts";
import client from "../../../../src/modules/bot/client.ts";
import { handleHelpBox } from "../../../../src/modules/bot/handlers/help.handler.ts";
import { fakeChat, fakeMessage } from "../../../fakes.ts";

const ADMIN_LID = "200000000000002@lid";

beforeEach(() => {
  vi.spyOn(client, "sendMessage").mockResolvedValue(undefined);
  vi.spyOn(client, "getLid").mockImplementation(async (jid) => (jid === "994500000002@s.whatsapp.net" ? ADMIN_LID : jid));
  vi.spyOn(Logger.prototype, "verbose").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

describe("handleHelpBox", () => {
  test.for([
    ["a stranger", "/help", false, helpBox],
    ["a group mate", "/help", true, helpBox + universityHelpbox],
    ["an Azerbaijani request", "/help @AZ", false, helpBoxAZ],
    ["an Azerbaijani request from a group mate", "/help @az", true, helpBoxAZ],
  ] as const)("sends the help box to %s", async ([, body, isGroupMateOrChat, expected]) => {
    const chat = fakeChat();
    const msg = fakeMessage({ body, chat });

    await handleHelpBox(chat, msg, isGroupMateOrChat);

    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith(expected, { linkPreview: false });
    expect(msg.react).toHaveBeenCalledWith("🚀");
  });

  test("adds the admin section for the bot owner in private", async () => {
    const chat = fakeChat({ id: ADMIN_LID });
    await handleHelpBox(chat, fakeMessage({ body: "/help", from: ADMIN_LID, chat }), true);
    expect(chat.sendMessage).toHaveBeenCalledWith(helpBox + universityHelpbox + adminHelpbox, { linkPreview: false });
  });

  test("adds the admin section to the Azerbaijani help too", async () => {
    const chat = fakeChat({ id: ADMIN_LID });
    await handleHelpBox(chat, fakeMessage({ body: "/help @az", from: ADMIN_LID, chat }), false);
    expect(chat.sendMessage).toHaveBeenCalledWith(helpBoxAZ + adminHelpbox, { linkPreview: false });
  });

  test("hides the admin section in groups, even for the bot owner", async () => {
    const chat = fakeChat({ isGroup: true, id: groups.UNICHAT });
    await handleHelpBox(chat, fakeMessage({ body: "/help", from: groups.UNICHAT, author: ADMIN_LID, chat }), true);
    expect(chat.sendMessage).toHaveBeenCalledWith(helpBox + universityHelpbox, { linkPreview: false });
  });

  test("logs the request", async () => {
    const chat = fakeChat({ name: "Ali" });
    await handleHelpBox(chat, fakeMessage({ body: "/help", chat }), false);
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("*HELPBOX_HANDLER* for *Ali*"));
  });

  test("reports failures", async () => {
    const chat = fakeChat();
    chat.sendMessage.mockRejectedValueOnce(new Error("not connected"));
    const msg = fakeMessage({ body: "/help", chat });

    await handleHelpBox(chat, msg, false);

    expect(msg.react).toHaveBeenCalledWith("❌");
    expect(client.sendMessage).toHaveBeenCalledWith(groups.LOG, expect.stringContaining("🔴"));
  });
});
