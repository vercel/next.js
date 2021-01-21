# Apollo SSR getDataFromTree Example

[Apollo](https://www.apollographql.com/client/) is a GraphQL client that allows you to easily query the exact data you need from a GraphQL server. In addition to fetching and mutating data, Apollo analyzes your queries and their results to construct a client-side cache of your data, which is kept up to date as further queries and mutations are run.

In this simple example, we integrate Apollo with Apollo's [getDataFromTree](https://www.apollographql.com/docs/react/performance/server-side-rendering/#executing-queries-with-getdatafromtree) to fetch queries on the server from inside any component and hydrate them in the client.

Because our app uses Apollo Client, some of the components in the React tree probably execute a GraphQL query with the useQuery hook. We can instruct Apollo Client to execute all of the queries required by the tree's components with the getDataFromTree function.

This function walks down the entire tree and executes every required query it encounters (including nested queries). It returns a Promise that resolves when all result data is ready in the Apollo Client cache.

When the Promise resolves, you're ready to render your React tree and return it, along with the current state of the Apollo Client cache.


We use a class instance called ApolloCacheControl to manage all registered caches. So we can have multiple caches in case we have multiple Apollo clients.
After the getDataFromTree has resolved all promises we get a snapshot of the cache and hydrate that to the client where we use is as an initial state for our Apollo client.


For the ease of making this example we took the PostList and other components from the with-apollo-ssr example.
This example relies on [Prisma + Nexus](https://github.com/prisma-labs/nextjs-graphql-api-examples) for its GraphQL backend.

## Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-apollo-ssr-get-data-from-tree&project-name=with-apollo-ssr-get-data-from-tree&repository-name=with-apollo-ssr-get-data-from-tree)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-apollo-ssr-get-data-from-tree with-apollo-ssr-app
# or
yarn create next-app --example with-apollo-ssr-get-data-from-tree with-apollo-ssr-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
