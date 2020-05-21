# Consume local Apollo GraphQL schema to create Static Generation export

Next.js ships with two forms of pre-rendering: [Static Generation](https://nextjs.org/docs/basic-features/pages#static-generation-recommended) and [Server-side Rendering](https://nextjs.org/docs/basic-features/pages#server-side-rendering). This example shows how to perform Static Generation using a local [Apollo GraphQL](https://www.apollographql.com/docs/apollo-server/) schema within [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation) and [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation). The end result is a Next.js application that uses one Apollo GraphQL schema to generate static pages at build time and also serve a GraphQL [API Route](https://nextjs.org/docs/api-routes/introduction) at runtime.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/api-routes-apollo-graphql-local-static)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example api-routes-apollo-graphql-local-static api-routes-apollo-graphql-local-static-app
# or
yarn create next-app --example api-routes-apollo-graphql-local-static api-routes-apollo-graphql-local-static-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/api-routes-apollo-graphql-local-static
cd api-routes-apollo-graphql-local-static
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
