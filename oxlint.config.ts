import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "import"],
  categories: {
    suspicious: "warn",
  },
  ignorePatterns: ["dist", "deprecated"],
  rules: {
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    "no-underscore-dangle": "off",
    "import/no-unassigned-import": ["warn", { allow: ["./lib/env", "dotenv/config"] }],
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
});
