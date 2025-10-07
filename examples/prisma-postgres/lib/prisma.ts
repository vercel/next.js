import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma-client/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter }).$extends(withAccelerate());

const globalForPrisma = global as unknown as { prisma: typeof prisma };

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
