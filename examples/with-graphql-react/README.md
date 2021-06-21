# Next.js example with [`graphql-react`](https://github.com/jaydenseric/graphql-react)

[`graphql-react`](https://github.com/jaydenseric/graphql-react) is a [GraphQL](https://graphql.org) client for [React](https://reactjs.org) using modern [context](https://reactjs.org/docs/context) and [hooks](https://reactjs.org/docs/hooks-intro) APIs that is lightweight (< 4 kB) but powerful; the first [Relay](https://relay.dev) and [Apollo](https://apollographql.com/docs/react) alternative with server side rendering. It can also be used to custom load, cache and server side render any data, even from non-GraphQL sources.

This example demonstrates:

- Polyfilling [required globals](https://github.com/jaydenseric/graphql-react#support) missing in Node.js.
- Loading and rendering GraphQL data in pages.
- Using Next.js [dynamic route](https://nextjs.org/docs/routing/dynamic-routes) parameters in GraphQL query variables.
- Using [`next-server-context`](https://github.com/jaydenseric/next-server-context) to set a HTTP response status code (e.g. 404) for the server side rendered page according to GraphQL query results.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-graphql-react&project-name=with-graphql-react&repository-name=with-graphql-react)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-graphql-react with-graphql-react-app
# or
yarn create next-app --example with-graphql-react with-graphql-react-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
