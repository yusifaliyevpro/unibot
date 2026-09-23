import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type GamePackages = {
  id: number;
  name: null | string;
  information: null | string;
  gameType: 1;
  editors: string[];
  questions: {
    comment: string | null;
    considered: null | string;
    question: string;
    answer: string;
    authors: string[];
    rekvizit: { text: boolean; rekvizit: string } | null;
  }[];
}[];

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);

const jsonPath = resolve(currentDirectory, "../3sual.json");

const data = JSON.parse(readFileSync(jsonPath, "utf8")) as GamePackages;

export const gamePackages = data;
