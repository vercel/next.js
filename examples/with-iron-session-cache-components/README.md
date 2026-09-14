# Authentication with Cache Components (iron-session)

This example shows how to combine per-user authentication with [Cache Components](https://nextjs.org/docs/app/getting-started/caching). It uses [iron-session](https://github.com/vvo/iron-session) for encrypted cookie sessions, but the caching patterns apply to any session or auth library.

The home page renders a shared, prerendered shell, then renders content that reads the session behind a `Suspense` boundary:

- **Shared data** (`getAnnouncements`) uses [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) and is part of the static shell.
- **The current user** (`getCurrentUser`) uses [`use cache: private`](https://nextjs.org/docs/app/api-reference/directives/use-cache-private) so it can read the session cookie while staying out of the shared, server-stored cache. It redirects when there is no signed-in user, so reads that start from it are protected.
- **Per-user data** (`lib/data.ts`) exports getters that take no user id. They call `getCurrentUser` and pass the resolved id to an unexported plain `use cache` function with a [`cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag), so it caches on the server and is invalidated with [`updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag).

The user data lives in memory (`lib/data.ts`) so the example runs without a database. Replace those functions with your own database queries, and verify passwords with a hashing library such as bcrypt.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-iron-session-cache-components&project-name=with-iron-session-cache-components&repository-name=with-iron-session-cache-components&env=SESSION_PASSWORD)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example with-iron-session-cache-components with-iron-session-cache-components-app
```

```bash
yarn create next-app --example with-iron-session-cache-components with-iron-session-cache-components-app
```

```bash
pnpm create next-app --example with-iron-session-cache-components with-iron-session-cache-components-app
```

```bash
bunx create-next-app --example with-iron-session-cache-components with-iron-session-cache-components-app
```

Copy `.env.example` to `.env.local` and set `SESSION_PASSWORD` to a value of at least 32 characters:

```bash
cp .env.example .env.local
openssl rand -base64 32 # paste the output as SESSION_PASSWORD
```

Then run the development server and sign in with the demo account (`ada@example.com` / `password`):

```bash
npm run dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
