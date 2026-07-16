# Email authentication with a local SMTP catcher

This example shows a Next.js app with [Auth.js](https://authjs.dev) magic-link (email) sign in,
using [Mailtrap Local](https://github.com/mailtrap/mailtrap-local) as the local SMTP server so you can read the login
emails during development without sending anything to a real inbox.

Mailtrap Local is a single-binary, MIT-licensed SMTP catcher with a web UI —
minimal setup for a Next.js dev who needs to test email locally. It listens for
SMTP on port `3535` and serves a web UI on [http://localhost:3550](http://localhost:3550).

Because the Email provider stores magic-link verification tokens in a database,
this example also starts a Postgres container (wired up with the
[Auth.js PostgreSQL adapter](https://authjs.dev/getting-started/adapters/pg)).
Both services are defined in `docker-compose.yml`.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example with-email-local-smtp with-email-local-smtp-app
```

```bash
yarn create next-app --example with-email-local-smtp with-email-local-smtp-app
```

```bash
pnpm create next-app --example with-email-local-smtp with-email-local-smtp-app
```

```bash
bunx create-next-app --example with-email-local-smtp with-email-local-smtp-app
```

### 1. Start the mail catcher and database

`docker-compose.yml` starts Mailtrap Local and Postgres:

```bash
docker compose up
```

Leave it running. The Postgres schema required by Auth.js is created
automatically from `init.sql` on first start.

### 2. Configure environment variables

Copy the example env file and append a generated auth secret to it:

```bash
cp .env.example .env.local
echo "AUTH_SECRET=$(curl -s https://generate-secret.vercel.app/32)" >> .env.local
```

The `echo` line writes a real value into `.env.local`, overriding the empty
`AUTH_SECRET=` placeholder (Auth.js throws `MissingSecret` if it is left empty).

The other defaults already point at the local services:

- `EMAIL_SERVER=smtp://localhost:3535` — the Mailtrap Local SMTP catcher
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/app` — the Postgres container

### 3. Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter any email address, and
submit the form. Then open the Mailtrap Local web UI at
[http://localhost:3550](http://localhost:3550) to read the sign-in email and
click the magic link to complete authentication.
