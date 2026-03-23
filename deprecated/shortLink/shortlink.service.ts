// import { sendErrorLog, sendLog } from "@/lib/logger";
// import WAWebJS, { Chat } from "whatsapp-web.js";
// import { PrismaService } from "@/src/prisma.service";
// import { Prisma, ShortenLink } from "@/generated/prisma/client";
// import { Injectable } from "@nestjs/common";
// import { nanoid } from "nanoid";
// import { ENV } from "@/lib/env";
// import { LogMessages } from "@/lib/logger_messages";

// @Injectable()
// export class ShortLinkService {
//   constructor(private prisma: PrismaService) {}

//   async handleShortLink(chat: Chat, msg: WAWebJS.Message) {
//     try {
//       const link = msg.links[0].link;
//       await msg.react("⏳");
//       const slug = nanoid().slice(0, 9).replaceAll("-", "").replaceAll("_", "");
//       if (await this.findShLink({ slug })) {
//         await this.handleShortLink(chat, msg);
//         return;
//       }

//       await this.createShLink({ link, slug });
//       await chat.sendMessage(`Your Short Link is ready: ${ENV.SHORTLINK_BASE_URL + slug}`);
//       await msg.react("✅");

//       await sendLog(LogMessages.SHORTLINK_HANDLER, msg);
//     } catch (error) {
//       await sendErrorLog(LogMessages.SHORTLINK_HANDLER, msg, error);
//     }
//   }
//   private async findShLink(ShortenLinkWhereUniqueInput: Prisma.ShortenLinkWhereUniqueInput): Promise<ShortenLink | null> {
//     return await this.prisma.shortenLink.findUnique({
//       where: ShortenLinkWhereUniqueInput,
//     });
//   }

//   private async createShLink(data: Prisma.ShortenLinkCreateInput): Promise<ShortenLink> {
//     return await this.prisma.shortenLink.create({
//       data,
//     });
//   }
// }
