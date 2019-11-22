# FaunaDB Graphql Starter Example -- The FaunaDB Guestbook

This simple Guestbook SPA example shows you how to use [FaunaDB's GraphQL endpoint](https://docs.fauna.com/fauna/current/api/graphql/) in your Next.js project. [[Live demo](https://with-graphql-faunadb.now.sh/)].

## Why FaunaDB

By importing a `.gql` or `.graphql` schema into FaunaDB ([see our sample schema file](./schema.gql)), FaunaDB will generate required Indexes and GraphQL resolvers for you -- hands free 👐 ([some limitations exist](https://docs.fauna.com/fauna/current/api/graphql/#limitations)).

## How to use

You can start with this template [using `create-next-app`](#using-create-next-app) or by [downloading the repository manually](#download-manually).

To use a live FaunaDB database, create one and import this example's `schema.gql` file using the FaunaDB console. Create a client secret, then paste it into `next.config.js`.

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) to bootstrap the example:

```
npx create-next-app --example with-graphql-faunadb with-graphql-faunadb
# or
yarn create next-app --example with-graphql-faunadb with-graphql-faunadb
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-graphql-faunadb
cd with-graphql-faunadb
```

### Run locally

Install packages, then run the development server:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Make sure to leave us a guestbook message in our [live demo](https://with-graphql-faunadb.now.sh/)! 😉

### Deploy

Deploy it to the cloud with [now](https://zeit.co/now)! [Install now](https://zeit.co/download) on your development machine before proceeding.

```bash
now
```
