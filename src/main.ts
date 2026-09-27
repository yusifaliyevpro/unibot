import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import "./lib/env.js";

if (typeof globalThis.crypto === "undefined") {
  void import("node:crypto").then((crypto) => {
    globalThis.crypto = crypto.webcrypto;
  });
}

async function bootstrap() {
  const logger = new Logger("NestApplication");
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;

  await app.listen(port, () => {
    logger.log(`Server is running on port ${port}`);
  });
}

bootstrap();
