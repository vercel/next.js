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

Run the following command to create a Prisma Postgres database and append the `DATABASE_URL` to your `.env`:

```
npx create-db >> .env
```

### 3. Setup your `.env` file

This command writes the `DATABASE_URL` to your `.env`. Verify it contains a value like:

```bash
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=PRISMA_POSTGRES_API_KEY"
```

If not, create `.env` and add the `DATABASE_URL` manually.

### 4. Migrate the database

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

### 5. Seed the database

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

### 6. Run the app

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

## Usage

The app includes the following routes:

- `/`: Display the three most recent posts
- `/posts`: Paginated list view of all posts
- `/posts/new`: Create a new post
- `/users/new`: Create a new user
- `/api/posts/`: Pagination logic

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fprisma-postgres&env=DATABASE_URL&envDescription=Add%20your%20PRISMA%20POSTGRES%20database%20url&project-name=prisma-postgres-app&repository-name=prisma-postgres)

## Additional information

Explore different ways to use Prisma ORM in your project with the following resources to help you expand your knowledge and customize your workflow:

- Prisma ORM supports multiple databases. Learn more about the supported databases [here](https://www.prisma.io/docs/orm/reference/supported-databases?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example).
- To use Prisma ORM in an edge runtime without using [Prisma Postgres](https://www.prisma.io/docs/orm/overview/databases/prisma-postgres?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example) or [Prisma Accelerate](https://www.prisma.io/docs/accelerate/getting-started?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example), refer to the [driver adapters guide](https://www.prisma.io/docs/orm/prisma-client/deployment/edge/deploy-to-vercel?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example).

For further learning and support:

- [Prisma ORM documentation](https://www.prisma.io/docs/orm?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
- [Prisma Client API reference](https://www.prisma.io/docs/orm/prisma-client?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
- [Join our Discord community](https://pris.ly/discord?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
- [Follow us on Twitter](https://pris.ly/x?utm_source=nextjs&utm_medium=example&utm_campaign=nextjs_example)
