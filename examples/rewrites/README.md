# Rewrites Example

This example shows how to use [rewrites in Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) to map an incoming request path to a different destination path.

The index page ([`app/page.tsx`](app/page.ts)) has a list of links that match the rewrites defined in [`next.config.js`](next.config.js). Run or deploy the app to see how it works!

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/rewrites)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/rewrites&project-name=rewrites&repository-name=rewrites)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example rewrites rewrites-app
```

```bash
yarn create next-app --example rewrites rewrites-app
```

```bash
pnpm create next-app --example rewrites rewrites-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
