# Prisma ORM + Next.js starter

This repository provides a boilerplate to quickly set up a Next.js application with [Prisma Postgres](https://www.prisma.io/postgres) and [Prisma ORM](https://www.prisma.io/orm) for database operations. It includes an easy setup process and example routes to add, view, and list posts, demonstrating basic CRUD operations with Prisma ORM.

## How to use

Run [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) using your preferred package manager:

```bash
# Using npm
npx create-next-app --example prisma-orm prisma-orm-app
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn create next-app --example prisma-orm prisma-orm-app

# Using pnpm
pnpm create-next-app --example prisma-orm prisma-orm-app

# Using bun
bunx create-next-app --example prisma-orm prisma-orm-app
```

</details>

## Getting started

Follow these steps to quickly set up the project and start using Prisma ORM with Next.js.

### 1. Create a Prisma Postgres instance

Create a Prisma Postgres database instance using [Prisma Data Platform](https://console.prisma.io):

1. Navigate to [Prisma Data Platform](https://console.prisma.io).
2. Click **New project** to create a new project.
3. Enter a name for your project in the **Name** field.
4. Inside the **Prisma Postgres®** section, click **Get started**.
5. Choose a region close to your location from the **Region** dropdown.
6. Click **Create project** to set up your database. This redirects you to the database setup page.
7. In the **Set up database access** section, copy the `DATABASE_URL`. You will use this in the next steps.

### 2. Setup your `.env` file

You now need to configure your database connection via an environment variable.

First, create an `.env` file:

```bash
touch .env
```

Then update the `.env` file by replacing the existing `DATABASE_URL` value with the one you previously copied. It will look similar to this:
   ```bash
   DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=PRISMA_POSTGRES_API_KEY"
   ```

### 2. Migrate the database and generate `PrismaClient`

Run the following commands to set up your database and Prisma schema:

```bash
# Using npm
npx prisma migrate dev --name init
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn prisma migrate dev --name init

# Using pnpm
pnpm prisma migrate dev --name init

# Using bun
bun prisma migrate dev --name init
```

</details>



### 3. Seed the database and start the server

Add initial data to your database:

```bash
# Using npm
npx prisma db seed
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn prisma db seed

# Using pnpm
pnpm prisma db seed

# Using bun
bun prisma db seed
```

</details>

<br/>

Start the development server:

```bash
# Using npm
npm run dev
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn dev

# Using pnpm
pnpm run dev

# Using bun
bun run dev
```

</details>

## Deployment

You can deploy the project to [Vercel](https://vercel.com/):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fprisma-orm&env=DATABASE_URL&envDescription=Add%20your%20PRISMA%20POSTGRES%20database%20url&project-name=prisma-orm-app&repository-name=prisma-orm)

## Additional information

- Prisma ORM supports multiple databases. Learn more about the supported databases [here](https://www.prisma.io/docs/orm/reference/supported-databases).
- To use Prisma ORM in an edge runtime without using [Prisma Postgres](https://www.prisma.io/docs/orm/overview/databases/prisma-postgres) or [Prisma Accelerate](https://www.prisma.io/docs/accelerate/getting-started), refer to the [driver adapters guide](https://www.prisma.io/docs/orm/prisma-client/deployment/edge/deploy-to-vercel).

For more resources:

- [Prisma ORM documentation](/orm)
- [Prisma Client API reference](/orm/prisma-client)
- Join our [Discord community](https://discord.com/invite/prisma)
- Follow us on [Twitter](https://twitter.com/prisma)
