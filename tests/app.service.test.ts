import { expect, test } from "vitest";
import { AppService } from "../src/app.service.ts";

test("greets", () => {
  expect(new AppService().getHello()).toBe("Hello World!");
});
