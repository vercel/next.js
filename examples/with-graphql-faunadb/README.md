# FaunaDB Graphql Starter Example -- The FaunaDB Guestbook

This simple Guestbook SPA example shows you how to use [FaunaDB's GraphQL endpoint](https://docs.fauna.com/fauna/current/api/graphql/) in your Next.js project. [[Live demo](https://with-graphql-faunadb.now.sh/)].

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-graphql-faunadb)

## Why FaunaDB

By importing a `.gql` or `.graphql` schema into FaunaDB ([see our sample schema file](./schema.gql)), FaunaDB will generate required Indexes and GraphQL resolvers for you -- hands free 👐 ([some limitations exist](https://docs.fauna.com/fauna/current/api/graphql/#limitations)).

## How to use

You can start with this template [using `create-next-app`](#using-create-next-app) or by [downloading the repository manually](#download-manually).

To use a live FaunaDB database, create a database at [dashboard.fauna.com](https://dashboard.fauna.com/) and generate an admin token by going to the **Security** tab on the left and then click **New Key**. Give the new key a name and select the 'Admin' Role. Copy the token since the setup script will ask for it. Do not use it in the frontend, it has superpowers which you don't want to give to your users.

The database can then be set up with the delivered setup by running:

```
yarn setup
```

This script will ask for the admin token. Once you provide it with a valid token, this is what the script automatically does for you:

- **Import the GraphQL schema**, by importing a GraphQL schema in FaunaDB, FaunaDB automatically sets up collections and indexes to support your queries. This is now done for you with this script but can also be done from the [dashboard.fauna.com](https://dashboard.fauna.com/) UI by going to the GraphQL tab
- **Create a role suitable for the Client**, FaunaDB has a security system that allows you to define which resources can be accessed for a specific token. That's how we limit our clients powers, feel free to look at the scripts/setup.js script to see how we make roles and tokens.
- **Create a token for that role** which is printed, this is the token to be used in the frontend.

At the end, the newly generated client token will be printed and should be used to replace the '< GRAPHQL_SECRET >' placeholder in the next.config.js config.

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```
npm init next-app --example with-graphql-faunadb with-graphql-faunadb
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

Deploy it to the cloud with [now](https://zeit.co/now)! [Install now](https://zeit.co/download) on your development machine before proceeding:

```bash
now
```
