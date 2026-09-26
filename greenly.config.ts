import { defineConfig } from "greenly";

export default defineConfig({
  name: "unibot",
  checks: [
    { name: "TypeScript", command: "pnpm tsc --noEmit" },
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Oxlint", command: "pnpm lint" },
    { name: "Build", command: "pnpm build" },
  ],
});
