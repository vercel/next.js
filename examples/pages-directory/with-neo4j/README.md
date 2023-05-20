# Neo4j Example

This is a simple set up for Next using Neo4j Database with api routes. Neo4j's Movies dataset example is used to run the example.

## Deploy your own

Once you have access to [the environment variables you'll need](#step-3-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-neo4j&project-name=with-neo4j&repository-name=with-neo4j&env=NEO4J_URI,NEO4J_USER,NEO4J_PASSWORD&envDescription=Required%20to%20connect%20the%20app%20with%20a%20Neo4j%20database&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-neo4j%23step-3-set-up-environment-variables)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-neo4j with-neo4j-app
```

```bash
yarn create next-app --example with-neo4j with-neo4j-app
```

```bash
pnpm create next-app --example with-neo4j with-neo4j-app
```

## Configuration

### Step 1. Create a Neo4j database

First, you'll need a Neo4j database. [Neo4j Desktop](https://neo4j.com/download/) and [Neo4j Online Sandbox](https://neo4j.com/sandbox/) are good and free to use options.

### Step 2. Add the movie graph model to the database

This example uses a database containing _Movies_, you can add it like so:

```bash
:play movie-graph
```

Also included is a Cypher [movie sample](./movie-sample.md) query if needed.

### Step 3. Set up environment variables

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local` to match your database uri and credentials.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-neo4j&project-name=with-neo4j&repository-name=with-neo4j&env=NEO4J_URI,NEO4J_USER,NEO4J_PASSWORD&envDescription=Required%20to%20connect%20the%20app%20with%20a%20Neo4j%20database&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-neo4j%23step-3-set-up-environment-variables)
