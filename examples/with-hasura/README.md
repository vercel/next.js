# Hasura Example

A simple example connecting Next.js and Hasura via graphql-request.

If you want to extend this example it's recommended to setup [GraphQL Code Generator](https://www.graphql-code-generator.com/).

## Deploy your own

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

3. Apply the Hasura metadata to your cloud project

    ```bash
    hasura metadata apply --project hasura --endpoint <Hasura Cloud Graphql Url without /v1/graphql> --admin-secret <Hasura Cloud admin secret>
    ```

### Setup Next.js

Create `.env.local`

```env
HASURA_GRAPHQL_URL=<Hasura Cloud Graphql Url>
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
