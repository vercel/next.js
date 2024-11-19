# Apollo Server and Client Auth Example

[Apollo](https://www.apollographql.com/client/) is a GraphQL client that allows you to easily query the exact data you need from a GraphQL server. In addition to fetching and mutating data, Apollo analyzes your queries and their results to construct a client-side cache of your data, which is kept up to date as further queries and mutations are run. The integration with Next and Apollo Server is implemented using the [apollo-server-integration-next](https://github.com/apollo-server-integrations/apollo-server-integration-next) community package.

In this simple example, we integrate Apollo seamlessly with [Next.js data fetching methods](https://nextjs.org/docs/basic-features/data-fetching) to fetch queries in the server and hydrate them in the browser.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/api-routes-apollo-server-and-client-auth)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes-apollo-server-and-client-auth&project-name=api-routes-apollo-server-and-client-auth&repository-name=api-routes-apollo-server-and-client-auth)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example api-routes-apollo-server-and-client-auth api-routes-apollo-server-and-client-auth-app
```

```bash
yarn create next-app --example api-routes-apollo-server-and-client-auth api-routes-apollo-server-and-client-auth-app
```

```bash
pnpm create next-app --example api-routes-apollo-server-and-client-auth api-routes-apollo-server-and-client-auth-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
