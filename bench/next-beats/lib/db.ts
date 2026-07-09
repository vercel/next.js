import 'server-only';

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Bench fixture: a committed, seeded SQLite file so the app builds and serves
// fully offline and deterministically. See prisma/dev.db.
const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
