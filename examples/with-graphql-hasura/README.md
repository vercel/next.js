# Hasura GraphQL Starter Example 

This example shows you how to use [Hasura's self-hosted GraphQL Engine](https://github.com/hasura/graphql-engine/) in your Next.js project.

Demo: https://with-graphql-hasura.vercel.app/

```bash
# launch self-hosted hasura 
cd db; yarn; make db

# launch nextjs app
cd app; yarn; yarn dev
```


## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-graphql-hasura/app)

[Deploy Hasura](https://hasura.io/docs/1.0/graphql/core/deployment/index.html) and then configure client in `app/pages/_app.tsx`. For example, [this demo](https://with-graphql-hasura.vercel.app/) is hosted on Hasura Cloud. The client source is [here](https://github.com/gparuthi/with-graphql-hasura/blob/master/pages/_app.tsx). 



## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-graphql-hasura with-graphql-hasura
# or
yarn create next-app --example with-graphql-hasura with-graphql-hasura
```
