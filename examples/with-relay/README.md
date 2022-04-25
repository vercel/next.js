# Relay Hooks Example

Relay is a JavaScript framework for building data-driven React applications.

## About Relay

- **Declarative:** Never again communicate with your data store using an imperative API. Simply declare your data requirements using GraphQL and let Relay figure out how and when to fetch your data.
- **Colocation:** Queries live next to the views that rely on them, so you can easily reason about your app. Relay aggregates queries into efficient network requests to fetch only what you need.
- **Mutations:** Relay lets you mutate data on the client and server using GraphQL mutations, and offers automatic data consistency, optimistic updates, and error handling.

[Relay Hooks](https://relay.dev/) is the easiest-to-use, safest Relay API. It relies on suspense, and is safe to use in React concurrent mode.

## Fetching Data

> _Recommended reading: [Thinking in Relay](https://relay.dev/docs/principles-and-architecture/thinking-in-relay/)_

This example demonstrates the two main strategies of optimised fetching data in
a Next.js application using Relay Hooks:

- **Page Data**: using Next.js's props loading methods `getStaticProps()`,
  `getServerSideProps()`, or `getInitialProps()` with Relay Hooks.
- **Lazy Data**: using Next.js's `next/dynamic` lazy component import in
  parallel with Relay's `useQueryLoader()` for render-as-you-fetch data loading.

### Page Data

When using `getStaticProps()`, `getServerSideProps()`, or `getInitialProps()`,
Next.js by default optimises network requests to fetch data + load JavaScript.

By leveraging Relay's compiler, we are able to combine deeply nested data
requirements into a single query executable within a `get*Props()` method,
avoiding waterfalls and staggered data loads.

See [`pages/index.jsx`](./pages/index.jsx) for an example of using
`getStaticProps()` (_the same code should work for `getServerSideProps()` &
`getInitialProps()`_)

### Lazy Data

There are times when your application loads a page with portions purposely
hidden until user interaction or some other event occurs. An example is
expanding a complex portion of the UI that is not often used; a better user
experience is achieved by delaying the loading & execution of JavaScript until
the user explicitly requests it. In Next.js, this is achieved using [dynamic
imports](https://nextjs.org/docs/advanced-features/dynamic-import).

To achieve optimised network requests for lazily (ie; _dynamically_) loaded
components, the data can be fetched in parallel using Relay's
[`useQueryLoader()` &
`usePreloadedQuery()`](https://relay.dev/docs/api-reference/use-preloaded-query/),
triggered at the same time as the user triggers the component load (eg; clicking
"Expand" to show some complex UI).

The example in [`pages/films.jsx`](./pages/films.jsx) builds on the concepts in
`pages/index.jsx` using `useQueryLoader()`, `usePreloadedQuery()`, and
`dynamic()` to optimise data & component loading to happen in parallel. Aka:
render-as-you-fetch.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-relay&project-name=with-relay&repository-name=with-relay)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-relay with-relay-app
# or
yarn create next-app --example with-relay with-relay-app
```

Download schema introspection data from configured Relay endpoint (_this example
uses the [StarWars GraphQL API](https://github.com/graphql/swapi-graphql)_):

```bash
npm run schema
# or
yarn schema
```

Run Relay ahead-of-time compilation (should be re-run after any edits to components that query data with Relay):

```bash
npm run relay
# or
yarn relay
```

Run the project:

```bash
npm run dev
# or
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
