# API routes with GraphQL server

Next.js ships with [API routes](https://github.com/vercel/next.js#api-routes), which provide an easy solution to build your own `API`. This example shows their usage alongside [apollo-server-micro](https://github.com/apollographql/apollo-server/tree/main/packages/apollo-server-micro) to provide simple GraphQL server consumed by Next.js app.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/api-routes-graphql)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example api-routes-graphql api-routes-graphql-app
# or
yarn create next-app --example api-routes-graphql api-routes-graphql-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/api-routes-graphql
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

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
