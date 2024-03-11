# Next.js and Inngest Example

This is an example of how to use [Inngest](https://inngest.com) to easily add durable work flows to your Next.js application. It keeps things simple:

- Bare bones examples with a single button UI that triggers an event
- Runs the Inngest dev server locally for immediate feedback

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/inngest&project-name=inngest&repository-name=inngest)

To full deploy you'll need an [Inngest Cloud account](https://inngest.com) and the [Vercel Inngest integration](https://vercel.com/integrations/inngest) configured.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example inngest inngest-app
```

```bash
yarn create next-app --example inngest inngest-app
```

```bash
pnpm create next-app --example inngest inngest-app
```

```bash
bunx create-next-app --example inngest inngest-app
```

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Notes

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The Inngest dev server will be running at [http://localhost:8288](http://localhost:8288). It can take a few seconds to start up.
