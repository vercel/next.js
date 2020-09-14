# Apollo Server and Client Auth Example

[Apollo](https://www.apollographql.com/client/) is a GraphQL client that allows you to easily query the exact data you need from a GraphQL server. In addition to fetching and mutating data, Apollo analyzes your queries and their results to construct a client-side cache of your data, which is kept up to date as further queries and mutations are run.

In this simple example, we integrate Apollo seamlessly with [Next.js data fetching methods](https://nextjs.org/docs/basic-features/data-fetching) to fetch queries in the server and hydrate them in the browser.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example api-routes-apollo-server-and-client-auth api-routes-apollo-server-and-client-auth-app
# or
yarn create next-app --example api-routes-apollo-server-and-client-auth api-routes-apollo-server-and-client-auth-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
