import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 140,
  singleQuote: false,
  insertFinalNewline: true,
  ignorePatterns: ["migrations", "src/prisma/contract.json", "src/prisma/contract.d.ts"],
  sortImports: {
    newlinesBetween: false,
  },
});
