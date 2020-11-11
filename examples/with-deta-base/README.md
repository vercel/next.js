# Next.js + Deta Base

A To Do app using Vercel functions and [Deta Base](https://docs.deta.sh/docs/base/about) for persistent To Dos.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-deta-base)

## Configuration

1. Get a project key from [Deta](https://www.deta.sh/).

2. Copy the `.env.local.example` to `.env.local`:

```shell
cp .env.local.example .env.local
```

3. Set the project key from 1 in `.env.local` such that `DETA_PROJECT_KEY=<project_key>`.

4. When you deploy to production, make sure you to set the [environment variable](https://vercel.com/docs/serverless-functions/introduction#environment-variables) `DETA_PROJECT_KEY` equal to your project key from 1.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-deta-base with-deta-base-app
# or
yarn create next-app --example with-deta-base with-deta-base-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).



