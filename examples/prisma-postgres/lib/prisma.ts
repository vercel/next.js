import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import "temporal-polyfill/global";
import type { Contract } from "../prisma/generated/contract.d";
import contractJson from "../prisma/generated/contract.json" with { type: "json" };

const contract = contractFromJson<Contract>(contractJson);

const createClient = () =>
  postgres({ contract, url: process.env.DATABASE_URL! });

const globalForPrisma = globalThis as unknown as {
  db?: ReturnType<typeof createClient>;
};

export const db = globalForPrisma.db ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;
