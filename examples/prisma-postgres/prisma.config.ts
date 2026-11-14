import "dotenv/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    output: "./prisma/generated",
    db: {
      connection: process.env.DATABASE_URL!,
    },
  }),
});
