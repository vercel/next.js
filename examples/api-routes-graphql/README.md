# API routes with GraphQL server

Next.js ships with [API routes](https://nextjs.org/docs/api-routes/introduction), which provide an easy solution to build your own `API`.
This example showcases how to build a lightweight and blazing fast GraphQL API with minimum configuration using GraphQL Yoga.

GraphQL Yoga comes with strong defaults:

- CORS is enabled by default
- Automatically masking unexpected errors and preventing sensitive information from leaking to clients.
- Shipped with GraphiQL

Yoga also brings support (with no additional dependency) for subscriptions, file uploads, and your favorite schema-building library (GraphQL Tools, Pothos, Nexus, TypeGraphQL, SDL first schema-design approaches, graphql-js, Apollo Tools).

More information on all available features are available [on the official documentation](https://www.graphql-yoga.com/docs/quick-start).

Finally, GraphQL Yoga is built on top of Envelop. Envelop is a library that helps build GraphQL API faster and flexibly with plugin-based architecture.

Similar to Express middlewares allowing you to customize requests' behavior, Envelop applies the same idea to GraphQL requests.

More information on [Envelop documentation](https://www.envelop.dev/).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/api-routes-graphql)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes-graphql&project-name=api-routes-graphql&repository-name=api-routes-graphql)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example api-routes-graphql api-routes-graphql-app
```

```bash
yarn create next-app --example api-routes-graphql api-routes-graphql-app
```

```bash
pnpm create next-app --example api-routes-graphql api-routes-graphql-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
