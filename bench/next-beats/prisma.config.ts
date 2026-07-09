import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Used by Migrate/CLI commands (db push, seed). The runtime PrismaClient
  // connects via the better-sqlite3 adapter in lib/db.ts instead.
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
