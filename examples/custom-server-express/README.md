# Custom Express Server example

Most of the time the default Next.js server will be enough but there are times you'll want to run your own server to integrate into an existing application. Next.js provides [a custom server api](https://nextjs.org/docs/advanced-features/custom-server).

The example shows a server that serves the component living in `pages/a.ts` when the route `/b` is requested and `pages/b.ts` when the route `/a` is accessed. This is obviously a non-standard routing strategy. You can see how this custom routing is being made inside `server.ts`.

Because the Next.js server is a Node.js module you can combine it with any other part of the Node.js ecosystem. In this case we are using express.

The example shows how you can use [TypeScript](https://typescriptlang.com) on both the server and the client while using [Nodemon](https://nodemon.io/) to live reload the server code without affecting the Next.js universal code.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/custom-server-express?runScript=dev)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/custom-server-express)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example custom-server-express custom-server-express-app
```

```bash
yarn create next-app --example custom-server-express custom-server-express-app
```

```bash
pnpm create next-app --example custom-server-express custom-server-express-app
```
