import "dotenv/config";
import { PrismaPlanetScale } from "@prisma/adapter-planetscale";
import { PrismaClient } from "../lib/generated/prisma/client";
import { fetch as undiciFetch } from "undici";
import { categories, products } from "./data";

const adapter = new PrismaPlanetScale({
  url: process.env.DATABASE_URL,
  fetch: undiciFetch,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  await prisma.product.deleteMany();
  console.log("Deleted records in product table");

  await prisma.category.deleteMany();
  console.log("Deleted records in category table");

  await prisma.$executeRaw`ALTER TABLE Product AUTO_INCREMENT = 1`;
  console.log("Reset product auto increment to 1");

  await prisma.$executeRaw`ALTER TABLE Category AUTO_INCREMENT = 1`;
  console.log("Reset category auto increment to 1");

  await prisma.category.createMany({
    data: categories,
  });
  console.log("Added category data");

  await prisma.product.createMany({
    data: products,
  });
  console.log("Added product data");

  console.log("Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
