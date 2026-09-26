import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getQuote } from "../../../../src/modules/bot/handlers/quote.handler.ts";

vi.mock(import("axios"), () => ({ default: { get: vi.fn() } }) as never);

beforeEach(() => {
  vi.mocked(axios.get).mockReset();
});

describe("getQuote", () => {
  test("returns today's quote", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [{ q: "Stay hungry.", a: "Steve Jobs", h: "<blockquote>" }] });
    await expect(getQuote()).resolves.toEqual({ quote: "Stay hungry.", author: "Steve Jobs" });
    expect(axios.get).toHaveBeenCalledWith("https://zenquotes.io/api/today");
  });

  test("returns undefined when the api fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("429"));
    await expect(getQuote()).resolves.toBeUndefined();
  });

  test("returns undefined for an empty response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
    await expect(getQuote()).resolves.toBeUndefined();
  });
});
