# Reason Relay Example

[Reason Relay](https://reason-relay-documentation.zth.vercel.app/)

This example relies on [Prisma + Nexus](https://github.com/prisma-labs/nextjs-graphql-api-examples) for its GraphQL backend.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-reason-relay&project-name=with-reason-relay&repository-name=with-reason-relay)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-reason-relay with-reason-relay-app
```

```bash
yarn create next-app --example with-reason-relay with-reason-relay-app
```

```bash
pnpm create next-app --example with-reason-relay with-reason-relay-app
```

Download schema introspection data from configured Relay endpoint:

```bash
npm run schema
# or
yarn schema
```

Run Relay ahead-of-time compilation (should be re-run after any edits to components that query data with Relay)

```bash
npm run relay
# or
yarn relay
```

Build and run the Relay project

```bash
npm run build
npm run dev
# or
yarn build
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
