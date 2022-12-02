# Next.js + Hasura

A boilerplate for using Next.js with [GraphQL Code Generator](https://www.graphql-code-generator.com/), [graphql-request](https://github.com/prisma-labs/graphql-request), and [Hasura](https://hasura.io/).

## Deploy your own

Create a [Hasura Cloud account](https://cloud.hasura.io/), then link it to Vercel [using the integration](https://vercel.com/integrations/hasura).

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-hasura&project-name=with-hasura&repository-name=with-hasura)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-hasura with-hasura-app
# or
yarn create next-app --example with-hasura with-hasura-app
# or
pnpm create next-app -- --example with-hasura with-hasura-app
```

### Setup Hasura

1. [Download the Hasura CLI](https://hasura.io/docs/latest/graphql/core/hasura-cli/install-hasura-cli/)

2. Create a Hasura Cloud project and connect a database named `default`

   <a href="https://cloud.hasura.io/?pg=nextjs-example&plcmt=body&tech=default" target="_blank" rel="noopener"><img src="https://graphql-engine-cdn.hasura.io/assets/main-site/deploy-hasura-cloud.png" /></a>

3. Launch the Hasura console and start developing your project

   ```bash
   hasura console --project hasura --endpoint <Hasura Cloud Graphql Url without /v1/graphql> --admin-secret <Hasura Cloud admin secret>
   ```

### Setup Next.js

1. Create `.env.local`

   ```env
   NEXT_PUBLIC_HASURA_PROJECT_ENDPOINT=<Hasura Cloud GraphQL Url>
   HASURA_ADMIN_SECRET=<Hasura Cloud Admin Secret>
   ```

1. Write your GraphQL queries in `service/queries.graphql`

1. Run GraphQL Code Generator `npm run codegen`

1. To fetch data in client or server components, import `graphql-request` client from `service/client.ts`;

1. Use the generated GraphQL queries with the `graphql-request` client

   ```typescript
   import { gqlClient } from '../service/client'
   import { GetProductsDocument } from '../service/gql/graphql'

   async function getProducts() {
     const { product } = await gqlClient.request(GetProductsDocument, {})
     return product
   }
   ```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
