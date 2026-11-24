import "dotenv/config";
import { defineConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
  orm: defineConfig({
    contract: "./src/prisma/contract.prisma",
    db: {
      connection: process.env["DIRECT_URL"]!,
    },
  }),
});
