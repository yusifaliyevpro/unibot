import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
    super({ adapter });
  }
}
