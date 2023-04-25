# Postgres.js Example

An example using [Postgres.js](https://github.com/porsager/postgres) in a Next.js project.

## Deploy your own

Once you have access to [the environment variables you'll need](#configure-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-postgres&project-name=with-postgres&repository-name=with-postgres&env=DATABASE_URL&envDescription=Required%20to%20connect%20the%20app%20with%20Postgres)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-postgres with-postgres-app
```

```bash
yarn create next-app --example with-postgres with-postgres-app
```

```bash
pnpm create next-app --example with-postgres with-postgres-app
```

## Configuration

### Set up a Postgres database

Set up a Postgres database locally or use your favorite provider.

### Configure environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (this will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `DATABASE_URL` variable in `.env.local` to the connection uri of your postgres database.

### Apply migrations

To setup up the migrations, use:

```bash
npm run migrate:up
# or
yarn migrate:up
```

### Start Next.js in development mode

```bash
npm run dev
# or
yarn dev
```

Your app should now be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

## Deploy on Vercel

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
