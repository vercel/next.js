# Xstate and routes

This example shows how to trigger state changes on a Xstate machine when navigating to a different route by listening to the router events and trigger the state changes.

It also shows how to initialize the machine once and use React Context to get its state across different pages and components inside those pages.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-xstate-and-routes)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-xstate-and-routes with-xstate-and-routes-app
```

or

```
yarn create next-app --example with-xstate-and-routes with-xstate-and-routes-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
