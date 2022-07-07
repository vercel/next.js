# Hello World example

This example shows how to use react context api in our app.

It provides an example of using `pages/_app.js` to include the context api provider and then shows how both the `pages/index.js` and `pages/about.js` can both share the same data using the context api consumer.

We start off by creating two contexts. One that actually never changes (`CounterDispatchContext`) and one that changes more often (`CounterStateContext`).

The `pages/index.js` shows how to, from the home page, increment and decrement the context data by 1 (a hard code value in the context provider itself).

The `pages/about.js` shows how to pass an increment value from the about page into the context provider itself.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-context-api)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-context-api&project-name=with-context-api&repository-name=with-context-api)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-context-api with-context-api-app
```

```bash
yarn create next-app --example with-context-api with-context-api-app
```

```bash
pnpm create next-app --example with-context-api with-context-api-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
