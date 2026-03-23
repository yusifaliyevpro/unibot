// import { Injectable } from "@nestjs/common";
// import { PrismaService } from "src/prisma.service";
// import { Prisma, Group } from "@/generated/prisma/client";

// @Injectable()
// export class GroupService {
//   constructor(private prisma: PrismaService) {}

//   async getGroup(GroupWhereUniqueInput: Prisma.GroupWhereUniqueInput): Promise<Group | null> {
//     return await this.prisma.group.findUnique({ where: GroupWhereUniqueInput });
//   }

//   async getGroups(where: Prisma.GroupWhereInput): Promise<Group[]> {
//     return await this.prisma.group.findMany({ where });
//   }

//   async registerGroup(data: Prisma.GroupCreateInput): Promise<Group> {
//     return await this.prisma.group.create({ data });
//   }
// }
