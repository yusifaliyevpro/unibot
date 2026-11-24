#!/usr/bin/env -S node
import { Migration, MigrationCLI, col, lit, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/60ab51425b2d4223709b5feb9d67b315216df714a837d7364102d7f9c7872e29/contract";
import endContract from "../../snapshots/60ab51425b2d4223709b5feb9d67b315216df714a837d7364102d7f9c7872e29/contract.json" with { type: "json" };

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: "public" }),
      this.createTable({
        schema: "public",
        table: "GameSession",
        columns: [
          col("chatId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("isActive", "bool", { notNull: true, codecRef: { codecId: "pg/bool@1" } }),
          col("lastQuestion", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("numberOfCorrectAnswers", "int4", {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("packageID", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("packageIndex", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
        ],
        constraints: [primaryKey(["id"])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
