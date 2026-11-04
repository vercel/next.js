# Prisma ORM + Next.js starter

This repository provides boilerplate to quickly set up a simple Next.js CRUD application with [Prisma Postgres](https://www.prisma.io/postgres?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example) and [Prisma ORM](https://www.prisma.io/orm?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example) for database operations.

## Getting started

Follow these steps to quickly set up the project and start using Prisma ORM with Next.js.

### 1. Create a Next.js app

Run [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) using your preferred package manager:

```bash
# Using npm
npx create-next-app@latest --example prisma-postgres my-prisma-postgres-app
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn create next-app --example prisma-postgres my-prisma-postgres-app

# Using pnpm
pnpm create-next-app --example prisma-postgres my-prisma-postgres-app

# Using bun
bunx create-next-app --example prisma-postgres my-prisma-postgres-app
```

</details>

Navigate into the created app:

```bash
cd ./my-prisma-postgres-app
```

Install the dependencies if you haven't already:

```bash
# Using npm
npm install
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn install

# Using pnpm
pnpm install

# Using bun
bun install
```

</details>

### 2. Create a Prisma Postgres instance

Create a [Prisma Postgres](https://www.prisma.io/postgres?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example) database and write its connection string to `.env` with a single command:

```bash
npx create-db@latest --env .env
```

The command prints a claim URL. Open it and sign in to keep the database; an unclaimed database is deleted after 24 hours.

Alternatively, create a database in the [Prisma Console](https://console.prisma.io/?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example), copy its connection string, and put it in a `.env` file in the project root:

```bash
DATABASE_URL="postgres://USER:PASSWORD@db.prisma.io:5432/postgres?sslmode=require"
```

Any other PostgreSQL database works the same way: set `DATABASE_URL` to its connection string.

### 3. Create the database tables

Run the following command to create the tables defined in `prisma/contract.prisma`:

```bash
# Using npm
npm run db:init
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn db:init

# Using pnpm
pnpm run db:init

# Using bun
bun run db:init
```

</details>

If the command stops with `Connection terminated unexpectedly`, the database you just created is still starting. Wait a few seconds and run it again.

### 4. Seed the database

Add initial data to your database:

```bash
# Using npm
npm run db:seed
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code> or <code>bun</code></summary>

```bash
# Using yarn
yarn db:seed

# Using pnpm
pnpm run db:seed

# Using bun
bun run db:seed
```

</details>

### 5. Run the app

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

Once the server is running, visit `http://localhost:3000` to start using the app.

### Changing the schema

The data model lives in `prisma/contract.prisma`. After you change it, regenerate the typed client and apply the change to your database:

```bash
npm run contract:emit
npm run db:update
```

## Usage

The app includes the following routes:

- `/`: Display the six most recent posts
- `/posts`: Paginated list view of all posts
- `/posts/new`: Create a new post
- `/users/new`: Create a new user
- `/api/posts/`: Pagination logic

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fprisma-postgres&env=DATABASE_URL&envDescription=Add%20your%20PRISMA%20POSTGRES%20database%20url&project-name=prisma-postgres-app&repository-name=prisma-postgres)

## Additional information

Explore different ways to use Prisma ORM in your project with the following resources to help you expand your knowledge and customize your workflow:

- [Prisma ORM documentation](https://www.prisma.io/docs/orm?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
- [Reading data](https://www.prisma.io/docs/orm/fundamentals/reading-data?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example) and [writing data](https://www.prisma.io/docs/orm/fundamentals/writing-data?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example) with the ORM client
- [Prisma Postgres documentation](https://www.prisma.io/docs/postgres?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
- [Prisma ORM with Next.js](https://www.prisma.io/docs/guides/frameworks/nextjs?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)

For further learning and support:

- [Join our Discord community](https://pris.ly/discord?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
- [Follow us on Twitter](https://pris.ly/x?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
