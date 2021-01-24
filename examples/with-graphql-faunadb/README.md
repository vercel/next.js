# FaunaDB Graphql Starter Example -- The FaunaDB Guestbook

This simple Guestbook SPA example shows you how to use [FaunaDB's GraphQL endpoint](https://docs.fauna.com/fauna/current/api/graphql/) in your Next.js project.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-graphql-faunadb&project-name=my-nextjs-guestbook&repository-name=my-nextjs-guestbook&env=NEXT_PUBLIC_FAUNADB_SECRET,NEXT_PUBLIC_FAUNADB_GRAPHQL_ENDPOINT&envDescription=Client%20secret%20and%20GraphQL%20endpoint%20needed%20for%20communicating%20with%20the%20live%20Fauna%20database&demo-title=Next.js%20Fauna%20Guestbook%20App&demo-description=A%20simple%20guestbook%20application%20built%20with%20Next.js%20and%20Fauna&demo-url=https%3A%2F%2Fnextjs-guestbook.vercel.app%2F)

## Why FaunaDB

By importing a `.gql` or `.graphql` schema into FaunaDB ([see our sample schema file](./schema.gql)), FaunaDB will generate required Indexes and GraphQL resolvers for you -- hands free 👐 ([some limitations exist](https://docs.fauna.com/fauna/current/api/graphql/#limitations)).

## How to use

You can start with this template [using `create-next-app`](#using-create-next-app) or by [downloading the repository manually](#download-manually).

To use a live FaunaDB database, create a database at [dashboard.fauna.com](https://dashboard.fauna.com/) and generate an admin token by going to the **Security** tab on the left and then click **New Key**. Give the new key a name and select the 'Admin' Role. Copy the token since the setup script will ask for it. Do not use it in the frontend, it has superpowers which you don't want to give to your users.

The database can then be set up with the delivered setup by running:

```
npm run setup
# or
yarn setup
```

This script will ask for the admin token. Once you provide it with a valid token, this is what the script automatically does for you:

- **Import the GraphQL schema**, by importing a GraphQL schema in FaunaDB, FaunaDB automatically sets up collections and indexes to support your queries. This is now done for you with this script but can also be done from the [dashboard.fauna.com](https://dashboard.fauna.com/) UI by going to the GraphQL tab
- **Create a role suitable for the Client**, FaunaDB has a security system that allows you to define which resources can be accessed for a specific token. That's how we limit our clients powers, feel free to look at the scripts/setup.js script to see how we make roles and tokens.
- **Create a token for that role** which is printed, this is the token to be used in the frontend.

At the end, a `.env.local` [file](https://nextjs.org/docs/basic-features/environment-variables) will be created for you with the newly generated client token assigned to an environment variable.

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```
npx create-next-app --example with-graphql-faunadb with-graphql-faunadb-app
# or
yarn create next-app --example with-graphql-faunadb with-graphql-faunadb-app
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

Your app should be up and running on [http://localhost:3000](http://localhost:3000)!

### Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-graphql-faunadb&project-name=my-nextjs-guestbook&repository-name=my-nextjs-guestbook&env=NEXT_PUBLIC_FAUNADB_SECRET,NEXT_PUBLIC_FAUNADB_GRAPHQL_ENDPOINT&envDescription=Client%20secret%20and%20GraphQL%20endpoint%20needed%20for%20communicating%20with%20the%20live%20Fauna%20database&demo-title=Next.js%20Fauna%20Guestbook%20App&demo-description=A%20simple%20guestbook%20application%20built%20with%20Next.js%20and%20Fauna&demo-url=https%3A%2F%2Fnextjs-guestbook.vercel.app%2F)
