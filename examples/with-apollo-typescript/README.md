# Apollo Typescript Example

[Apollo](https://www.apollographql.com/client/) is a GraphQL client that allows you to easily query the exact data you need from a GraphQL server. In addition to fetching and mutating data, Apollo analyzes your queries and their results to construct a client-side cache of your data, which is kept up to date as further queries and mutations are run.

In this simple example, we integrate Apollo seamlessly with [Next.js data fetching methods](https://nextjs.org/docs/basic-features/data-fetching) to fetch queries in the server and hydrate them in the browser.

This example relies on SpaceX api (https://api.spacex.land/graphql) for its GraphQL backend.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-apollo-typescript with-apollo-typescript-app
# or
yarn create next-app --example with-apollo-typescript with-apollo-typescript-app
```

## Generate GraphQL types

```
yarn generate
```

you should configure backend schema in codegen.yml file.
