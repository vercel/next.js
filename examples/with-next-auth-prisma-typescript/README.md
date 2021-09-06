# Next.js + NextAuth.js + Prisma.io + Typescript demo

This example uses [NextAuth.js](https://next-auth.js.org/), [Prisma](https://prisma.io), [SQLite]("https://www.sqlite.org/index.html") and [Typescript](https://www.typescriptlang.org/). This is roughly half of the stack detailed on [init.tips](https://init.tips/).

We're using the [NextAuth.js v4 Beta](https://twitter.com/nextauthjs/status/1434508619970666506).

We loaded up most of the files with comments describing what they do and how to expand upon them. Be sure to check out:

- [`prisma/schema.prisma`](./prisma/schema.prisma)
- [`pages/index.tsx`](./pages/index.tsx)
- [`pages/_app.tsx`](./pages/_app.tsx)
- [`pages/api/auth/\[...nextauth\].ts`](./pages/api/auth/[...nextauth].ts)

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-next-auth-prisma-typescript)

## Deploy your own

Note: We *highly recommend* moving from SQLite to a hosted PostgreSQL instance before deploying as a real service. See the [`schema.prisma`](./prisma/schema.prisma) for more info

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-next-auth-prisma-typescript&project-name=with-next-auth-prisma-typescript&repository-name=with-next-auth-prisma-typescript)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-next-auth-prisma-typescript [app name]
# or
yarn create next-app --example with-next-auth-prisma-typescript [app name]
```

## How to run

Install and run

```bash
npm i
npx prisma migrate
npm run dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
