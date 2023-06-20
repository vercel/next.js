# Apollo & Redux Example

This example serves as a conduit if you were using Apollo 1.X with Redux, and are migrating to Apollo 3.x, however, you have chosen not to manage your entire application state within Apollo (`apollo-link-state`).

In 3.0.0, Apollo serves out-of-the-box support for redux in favor of Apollo's state management. This example aims to be an amalgamation of the [`with-apollo`](https://github.com/vercel/next.js/tree/canary/examples/with-apollo) and [`with-redux`](https://github.com/vercel/next.js/tree/canary/examples/with-redux) examples.

To inspect the GraphQL API, use its [web IDE](https://nextjs-graphql-with-prisma-simple-foo.vercel.app/api).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-apollo-and-redux&project-name=with-apollo-and-redux&repository-name=with-apollo-and-redux)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-apollo-and-redux with-apollo-and-redux-app
```

```bash
yarn create next-app --example with-apollo-and-redux with-apollo-and-redux-app
```

```bash
pnpm create next-app --example with-apollo-and-redux with-apollo-and-redux-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
