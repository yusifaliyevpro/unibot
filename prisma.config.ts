import "dotenv/config";
import { defineConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
  orm: defineConfig({
    contract: "./prisma/contract.prisma",
    output: "src/prisma",
    migrations: { dir: "prisma/migrations" },
    db: {
      connection: process.env["DIRECT_URL"]!,
    },
  }),
});
