# Next.js example with [`graphql-react`](https://github.com/jaydenseric/graphql-react)

[`graphql-react`](https://github.com/jaydenseric/graphql-react) is a [GraphQL](https://graphql.org) client for [React](https://reactjs.org) using modern [context](https://react.dev/learn/scaling-up-with-reducer-and-context) and [hooks](https://react.dev/learn/scaling-up-with-reducer-and-context) APIs that is lightweight (&lt; 3 KB [size limited](https://github.com/ai/size-limit)) but powerful; the first [Relay](https://facebook.github.io/relay) and [Apollo](https://apollographql.com/docs/react) alternative with server side rendering.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-graphql-react)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-graphql-react&project-name=with-graphql-react&repository-name=with-graphql-react)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-graphql-react with-graphql-react-app
```

```bash
yarn create next-app --example with-graphql-react with-graphql-react-app
```

```bash
pnpm create next-app --example with-graphql-react with-graphql-react-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

- In `pages/_app.js` a [custom `App` component](https://github.com/vercel/next.js#custom-app) is decorated with the [`withGraphQLApp`](https://github.com/jaydenseric/next-graphql-react/#function-withgraphqlapp) [higher-order component](https://reactjs.org/docs/higher-order-components) from [`next-graphql-react`](https://github.com/jaydenseric/next-graphql-react), generating a `graphql` prop that populates the [`GraphQLProvider`](https://github.com/jaydenseric/graphql-react#function-graphqlprovider) component from [`graphql-react`](https://github.com/jaydenseric/graphql-react).
- In `pages/index.js` the [`useGraphQL`](https://github.com/jaydenseric/graphql-react#function-usegraphql) React hook from [`graphql-react`](https://github.com/jaydenseric/graphql-react) is used to query the [GraphQL Pokémon API](https://github.com/lucasbento/graphql-pokemon) and show a picture of Pikachu.
