import { Logger } from "@nestjs/common";
import client from "../modules/bot/client";
import { groups } from "./constants";
import type { Message } from "whatsapp-web.js";

const logger = new Logger("LoggerService");

export async function sendLog(message: string, msg: Message | null) {
  let name = "";
  if (msg) {
    name = (await msg.getChat()).name;
  }
  const icon = "🔵 ";
  const time = `${new Date().toLocaleString()} | `;
  let textMessage = `${message} for ${name}`;
  logger.verbose(icon + textMessage);
  textMessage = `*${message}* for *${name}*`;
  await client.sendMessage(groups.LOG, icon + time + textMessage);
}

export async function sendErrorLog(message: string, msg: Message | null, error: unknown) {
  let name = "";
  if (msg) {
    await msg.react("❌");
    name = (await msg.getChat()).name;
  }
  const icon = "🔴 ";
  const time = `${new Date().toLocaleString()} | `;
  let textMessage = `${message} for ${name}`;
  logger.error(icon + textMessage, error);
  textMessage = `*${message}* for *${name}*`;
  await client.sendMessage(groups.LOG, icon + time + textMessage);
}
