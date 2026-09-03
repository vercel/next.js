**Template repo:** https://github.com/neondatabase-labs/vercel-marketplace-neon

# Neon Postgres + Next.js

This example shows how to use [Neon](https://neon.tech) serverless Postgres with the Next.js App Router: [Drizzle ORM](https://orm.drizzle.team/) for the schema and queries, [Better Auth](https://www.better-auth.com/) for email and password authentication, and [`pg`](https://www.npmjs.com/package/pg) with [`@vercel/functions`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool) for pooling on Vercel.

## Getting started

### 1. Create a Next.js app from this example

Run [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with the `with-neon` example:

```bash
npx create-next-app@latest my-neon-app --example with-neon
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code>, or <code>bun</code></summary>

```bash
yarn create next-app --example with-neon my-neon-app

pnpm create-next-app --example with-neon my-neon-app

bunx create-next-app --example with-neon my-neon-app
```

</details>

Go to the project directory and install dependencies:

```bash
cd my-neon-app
npm install
```

<details>

<summary>Expand for <code>yarn</code>, <code>pnpm</code>, or <code>bun</code></summary>

```bash
yarn install

pnpm install

bun install
```

</details>

### 2. Create a Neon database

Create a Neon project in the [Neon console](https://console.neon.tech/) (or connect Neon through the [Vercel Marketplace](https://vercel.com/marketplace/neon) when you deploy). Copy the **pooled** connection string (recommended for serverless).

### 3. Configure environment variables

Copy the example env file and fill in real values:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string from Neon (use pooled connection for serverless). |
| `BETTER_AUTH_SECRET` | Long random secret (e.g. `openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | Base URL of the app: `http://localhost:3000` locally; your production URL on Vercel. |

### 4. Apply the database schema

With `DATABASE_URL` set in `.env`, push or migrate the Drizzle schema to Neon:

```bash
# Quick sync (good for development)
npx drizzle-kit push
```

Alternatively, generate and apply SQL migrations:

```bash
npm run db:generate
npx drizzle-kit migrate
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The footer shows whether the database connection succeeded. Use **Sign In** / sign-up flows to exercise Better Auth against your Neon database.

## Project structure

- `app/` — App Router pages and `app/api/auth/[...all]` for Better Auth.
- `lib/db/client.ts` — `pg` pool, Drizzle client, and `attachDatabasePool` for Vercel.
- `lib/auth/` — Better Auth server config, Drizzle schema (user, session, account, verification), and React client helpers.

## Deploy

Deploy to [Vercel](https://vercel.com) and set the same environment variables in the project settings. See [Neon’s Vercel docs](https://neon.tech/docs/guides/vercel) and [Connecting a Vercel project](https://neon.tech/docs/connect/connect-vercel) for integration details.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-neon&project-name=with-neon-app&repository-name=with-neon-app&env=DATABASE_URL&env=BETTER_AUTH_SECRET&env=BETTER_AUTH_URL&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

## Further reading

- [Neon documentation](https://neon.tech/docs)
- [Drizzle ORM — PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [Better Auth — Next.js](https://www.better-auth.com/docs/integrations/next)
