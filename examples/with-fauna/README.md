# Fauna Guestbook Starter

This Guestbook Application example shows you how to use [Fauna](https://docs.fauna.com/) in your Next.js project.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-fauna)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-fauna&project-name=fauna-nextjs-guestbook&repository-name=fauna-nextjs-guestbook&demo-title=Next.js%20Fauna%20Guestbook%20App&demo-description=A%20simple%20guestbook%20application%20built%20with%20Next.js%20and%20Fauna&integration-ids=oac_Erlbqm8Teb1y4WhioE3r2utY)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-fauna with-fauna-app
```

```bash
yarn create next-app --example with-fauna with-fauna-app
```

```bash
pnpm create next-app --example with-fauna with-fauna-app
```

### Setting Up Your Fauna Database

Head over to [Fauna Dashboard](https://dashboard.fauna.com/) and create a new database. You can name it whatever you want, but for this example, we'll use `nextjs-guestbook`. Next, create a new collection called `Entry` in your new database.
Finally create a new database access key to connect to your database.

Watch [this video](https://www.youtube.com/watch?v=8YJcG2fUPyE&t=43s&ab_channel=FaunaInc.) to learn how to connect to your database.

### Run locally

Install packages, set up if needed, then run the development server:

```bash
npm install
npm run dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)!
