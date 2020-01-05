# API routes with GraphQL server

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/api-routes-graphql)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example api-routes-graphql api-routes-graphql-app
# or
yarn create next-app --example api-routes-graphql api-routes-graphql-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/api-routes-graphql
cd api-routes-graphql
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

Next.js ships with [API routes](https://github.com/zeit/next.js#api-routes), which provide an easy solution to build your own `API`. This example shows their usage alongside [apollo-server-micro](https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-micro) to provide simple GraphQL server consumed by Next.js app.
