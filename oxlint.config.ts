import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "import", "vitest"],
  categories: {
    suspicious: "warn",
  },
  ignorePatterns: ["dist", "deprecated"],
  rules: {
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    "no-underscore-dangle": "off",
    "import/no-unassigned-import": ["warn", { allow: ["./lib/env.js", "dotenv/config"] }],
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
  overrides: [
    {
      // Nest DI needs constructor param types as runtime values for decorator metadata
      files: ["**/*.service.ts", "**/*.controller.ts", "**/*.module.ts", "**/*.gateway.ts"],
      rules: { "typescript/consistent-type-imports": "off" },
    },
    {
      // vi.fn(impl) already infers its type; stand-in classes and test Nest modules are empty by design
      files: ["tests/**"],
      rules: { "vitest/require-mock-type-parameters": "off", "typescript/no-extraneous-class": "off" },
    },
  ],
});
