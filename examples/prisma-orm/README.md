# Prisma ORM + Next.js starter

This repository provides a boilerplate to quickly set up a Next.js application with Prisma ORM for database operations. It includes an easy setup process and example routes to add, view, and list posts, demonstrating basic CRUD operations with Prisma ORM.

## How to use

Run [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) using your preferred package manager:

```bash
# Using npm
npx create-next-app --example prisma-orm prisma-orm-app

# Using yarn
yarn create next-app --example prisma-orm prisma-orm-app

# Using pnpm
pnpm create-next-app --example prisma-orm prisma-orm-app

# Using bun
bunx create-next-app --example prisma-orm prisma-orm-app
```

## Getting started

Follow these steps to quickly set up the project and start using Prisma ORM with Next.js.

### 1. Set up environment variables

Create an `.env` file and add your `DATABASE_URL`:

```bash
mv .env.example .env
```

Update the `.env` file:

```env
DATABASE_URL="Insert your PostgreSQL database URL here"
```

This example uses Prisma ORM with a PostgreSQL database. If you do not have a database, follow the steps [here](https://www.prisma.io/docs/guides/prisma-orm-with-nextjs#22-save-your-database-connection-string) to set up a [Prisma PostgreSQL](https://www.prisma.io/postgres) database.

If you're using Prisma Postgres, install the required extension:

```bash
# Using npm
npm install @prisma/extension-accelerate

# Using yarn
yarn add @prisma/extension-accelerate

# Using pnpm
pnpm add @prisma/extension-accelerate

# Using bun
bun add @prisma/extension-accelerate
```

Then, modify the `PrismaClient` in [`lib/prisma.ts`](/lib/prisma.ts):

```diff
import { PrismaClient } from "@prisma/client";
+ import { withAccelerate } from '@prisma/extension-accelerate';

- const prisma = new PrismaClient();
+ const prisma = new PrismaClient().$extends(withAccelerate());

const globalForPrisma = global as unknown as { prisma: typeof prisma };

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
```

### 2. Migrate the database and generate Prisma client

Run the following commands to set up your database and Prisma schema:

```bash
# Using npm
npx prisma migrate dev --name init

# Using yarn
yarn prisma migrate dev --name init

# Using pnpm
pnpm prisma migrate dev --name init

# Using bun
bun prisma migrate dev --name init
```

Generate the Prisma client:

```bash
# Using npm
npx prisma generate

# Using yarn
yarn prisma generate

# Using pnpm
pnpm prisma generate

# Using bun
bun prisma generate
```

If using Prisma Postgres, generate `PrismaClient` without an engine:

```bash
# Using npm
npx prisma generate --no-engine

# Using yarn
yarn prisma generate --no-engine

# Using pnpm
pnpm prisma generate --no-engine

# Using bun
bun prisma generate --no-engine
```

Update the `postinstall` script in [`package.json`](/package.json):

```diff
-"postinstall": "prisma generate"
+"postinstall": "prisma generate --no-engine"
```

### 3. Seed the database and start the server

Add initial data to your database:

```bash
# Using npm
npx prisma db seed

# Using yarn
yarn prisma db seed

# Using pnpm
pnpm prisma db seed

# Using bun
bun prisma db seed
```

Start the development server:

```bash
# Using npm
npm run dev

# Using yarn
yarn dev

# Using pnpm
pnpm run dev

# Using bun
bun run dev
```

## Deployment

To deploy your application in [Vercel](https://vercel.com/), see [this section](https://www.prisma.io/docs/guides/prisma-orm-with-nextjs#7-deploy-your-application-to-vercel-optional) in the Prisma ORM documentation.

## Additional information

- Prisma ORM supports multiple databases. Learn more about the supported databases [here](https://www.prisma.io/docs/orm/reference/supported-databases).
- To use Prisma ORM in an edge runtime without using [Prisma Postgres](https://www.prisma.io/docs/orm/overview/databases/prisma-postgres) or [Prisma Accelerate](https://www.prisma.io/docs/accelerate/getting-started), refer to the [driver adapters guide](https://www.prisma.io/docs/orm/prisma-client/deployment/edge/deploy-to-vercel).

For more resources:

- [Prisma ORM documentation](/orm)
- [Prisma Client API reference](/orm/prisma-client)
- Join our [Discord community](https://discord.com/invite/prisma)
- Follow us on [Twitter](https://twitter.com/prisma)
