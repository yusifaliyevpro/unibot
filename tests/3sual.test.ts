import { describe, expect, test } from "vitest";
import { gamePackages } from "../src/3sual.ts";

// The game relies on these guarantees of the bundled question data

describe("game packages", () => {
  test("are loaded", () => {
    expect(gamePackages.length).toBeGreaterThan(0);
  });

  test("have unique ids", () => {
    const ids = gamePackages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("each have at least one question", () => {
    expect(gamePackages.filter((p) => p.questions.length === 0).map((p) => p.id)).toEqual([]);
  });

  test("have editor lists", () => {
    expect(gamePackages.filter((p) => !Array.isArray(p.editors)).map((p) => p.id)).toEqual([]);
  });

  test("questions have a question, an answer and an authors list", () => {
    const broken = gamePackages.flatMap((p) =>
      p.questions
        .map((q, i) => ({ id: p.id, i, q }))
        .filter(({ q }) => !q.question?.trim() || !q.answer?.trim() || !Array.isArray(q.authors))
        .map(({ id, i }) => `${id}#${i + 1}`),
    );
    expect(broken).toEqual([]);
  });

  test("rekvizits are text or an image path on api.3sual.az", () => {
    const broken = gamePackages.flatMap((p) =>
      p.questions
        .filter(
          ({ rekvizit }) =>
            rekvizit &&
            (typeof rekvizit.text !== "boolean" ||
              !rekvizit.rekvizit?.trim() ||
              (!rekvizit.text && !/^rekvizit\/.+\.(jpe?g|png|gif|jfif)$/i.test(rekvizit.rekvizit))),
        )
        .map(() => p.id),
    );
    expect(broken).toEqual([]);
  });
});
