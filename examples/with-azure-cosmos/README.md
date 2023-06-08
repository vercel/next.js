## Example app using Azure Cosmos DB

[Azure Cosmos DB](https://azure.microsoft.com/en-in/products/cosmos-db) is a fully managed NoSQL and relational database for modern app development. Azure Cosmos DB offers single-digit millisecond response times, automatic and instant scalability, along with guarantee speed at any scale. Business continuity is assured with SLA-backed availability and enterprise-grade security.

## Deploy your own

Once you have access to the environment variables you'll need, deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?project-name=with-azure-cosmos&repository-name=with-azure-cosmos&repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-azure-cosmos&integration-ids=oac_mPA9PZCLjkhQGhlA5zntNs0L)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-azure-cosmos with-azure-cosmos-app
```

```bash
yarn create next-app --example with-azure-cosmos with-azure-cosmos-app
```

```bash
pnpm create next-app --example with-azure-cosmos with-azure-cosmos-app
```

## Configuration

### Set up a Azure Cosmos DB database

Set up a CosmosDB database with [Try Azure Cosmos DB free](https://cosmos.azure.com/try/).

### Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `COSMOSDB_CONNECTION_STRING` - You will need your Cosmos DB connection string. You can find these in the Azure Portal in keys section.
- `COSMOSDB_DATABASE_NAME` - Name of the database you plan on using. This should already exist in the Cosmos DB account.
- `COSMOSDB_CONTAINER_NAME` - Name of the container you plan on using. This should already exist in the previous database.

### Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

You will either see a message stating "You are connected to CosmosDB" or "You are NOT connected to CosmosDB". Please make sure you have provided valid environment variables.

When you are successfully connected, you can refer to the [Azure Cosmos DB client library for JavaScript/TypeScript](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/cosmosdb/cosmos) for further instructions on how to query your database.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
