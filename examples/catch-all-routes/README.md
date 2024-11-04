# Catch All Routes Example

This example shows how to use [Catch all routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes) in Next.js, which allows a dynamic route to catch all paths.

The catch all page is in `app/post/[...slug]/page.tsx`, it matches any path after `/post`, like the following:

- `/post/first-post`,
- `/post/2020/first-post`
- `/post/2020/first-post/with/catch/all/routes`
- Anything that matches the glob `/post/**`

You can use `next/link` as displayed in this example to route to these pages client side.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/catch-all-routes)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/catch-all-routes&project-name=catch-all-routes&repository-name=catch-all-routes)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example catch-all-routes catch-all-routes-app
```

```bash
yarn create next-app --example catch-all-routes catch-all-routes-app
```

```bash
pnpm create next-app --example catch-all-routes catch-all-routes-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
