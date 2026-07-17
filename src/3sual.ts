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

const data = require("./../3sual.json");

export const gamePackages = data as GamePackages;
