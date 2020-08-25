# Example using Neo4j Database

This is a simple set up for Next using Neo4j Database with api routes. Neo4j's Movies dataset example is used.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-neo4j)

## How to use

You can start with this template [using `create-next-app`](https://github.com/vercel/next.js/tree/canary/examples/with-neo4j#using-create-next-app) or by [downloading the repository manually](https://github.com/vercel/next.js/tree/canary/examples/with-neo4j#download-manually)

[Neo4j Desktop](https://neo4j.com/download/) has been used for this example, however, [Neo4j Online Sandbox](https://neo4j.com/sandbox/) can also be used. Both as free instances.

Create a database with neo4j desktop or online sandbox and create your credentials. For this example use the sample database containing _Movies_:

```
:play movie-graph
```

You need use the Neo4j JavaScript Driver:

```bash
yarn add neo4j-driver
```

Also included is a Cypher [movie sample](https://github.com/vercel/next.js/blob/canary/examples/with-neo4j/movie-sample.md) query if needed.

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```
npx create-next-app --example with-neo4j with-neo4j
# or
yarn create next-app --example with-neo4j with-neo4j
```

## Configuration

1. Create a neo4j database.
2. Add the [movie sample](https://github.com/vercel/next.js/blob/canary/examples/with-neo4j/movie-sample.md) to database.
3. Create a `.env.local` file and copy the contents of `.env.local.example` into it:

```bash
cp .env.local.example .env.local
```

3. Set each variable on `.env.local` with your database uri and credentials.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.
