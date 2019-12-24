# Relay Modern Example

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-relay-modern)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-relay-modern with-relay-modern-app
# or
yarn create next-app --example with-relay-modern with-relay-modern-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-relay-modern
cd with-relay-modern
```

Install it:

```bash
npm install
# or
yarn
```

Download schema introspection data from configured Relay endpoint

```bash
npm run schema
# or
yarn schema
```

Run Relay ahead-of-time compilation (should be re-run after any edits to components that query data with Relay)

```bash
npm run relay
# or
yarn relay
```

Run the project

```bash
npm run dev
# or
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

[Relay Modern](https://relay.dev/) is a new version of Relay designed from the ground up to be easier to use, more extensible and, most of all, able to improve performance on mobile devices. Relay Modern accomplishes this with static queries and ahead-of-time code generation.

In this simple example, we integrate Relay Modern seamlessly with Next by wrapping our _pages_ inside a [higher-order component (HOC)](https://facebook.github.io/react/docs/higher-order-components.html). Using the HOC pattern we're able to pass down a query result data created by Relay into our React component hierarchy defined inside each page of our Next application. The HOC takes `options` argument that allows to specify a `query` that will be executed on the server when a page is being loaded.

This example relies on [graph.cool](https://www.graph.cool) for its GraphQL backend.
