# GraphQL Hooks Example

[GraphQL Hooks](https://github.com/nearform/graphql-hooks) is a library from NearForm that intends to be a minimal hooks-first GraphQL client, providing a similar API to Apollo.

You'll see this shares the same layout as the `with-apollo` example, this is so you can compare the two side by side. The app itself should also look identical.

This started life as a copy of the `with-apollo` example. We then stripped out Apollo and replaced it with `graphql-hooks`. This was mostly as an exercise in ensuring basic functionality could be achieved in a similar way to Apollo. The [bundle size](https://bundlephobia.com/result?p=graphql-hooks) of `graphql-hooks` is tiny in comparison to Apollo and should cover a fair amount of use cases.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-graphql-hooks&project-name=with-graphql-hooks&repository-name=with-graphql-hooks)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-graphql-hooks with-graphql-hooks-app
```

```bash
yarn create next-app --example with-graphql-hooks with-graphql-hooks-app
```

```bash
pnpm create next-app --example with-graphql-hooks with-graphql-hooks-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
