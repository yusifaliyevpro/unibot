import { describe, expect, test } from "vitest";
import { adminHelpbox, helpBox, helpBoxAZ, universityHelpbox } from "../../src/lib/messages.ts";

describe("help boxes", () => {
  test.for([
    ["helpBox", helpBox],
    ["helpBoxAZ", helpBoxAZ],
  ])("%s lists the public commands", ([, box]) => {
    for (const command of ["/help", "/start", "/pdf", "/s"]) expect(box).toContain(`${command} `);
  });

  test("university help lists every schedule form", () => {
    const lines = universityHelpbox.split("\n").filter((line) => line.startsWith("📅"));
    expect(lines.map((line) => line.split(" - ")[0])).toEqual([
      "📅 /schedule",
      "📅 /schedule /tomorrow",
      "📅 /schedule _[1-5]_",
      "📅 /schedule _[1-5]_ /upper",
      "📅 /schedule _[1-5]_ /lower",
    ]);
  });

  test("admin help lists the admin commands", () => {
    expect(adminHelpbox).toContain("/confirm");
    expect(adminHelpbox).toContain("/echo");
  });

  test("appended sections start on their own paragraph", () => {
    expect(universityHelpbox.startsWith("\n\n")).toBe(true);
    expect(adminHelpbox.startsWith("\n\n")).toBe(true);
  });
});
