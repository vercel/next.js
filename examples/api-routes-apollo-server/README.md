# Consume local Apollo GraphQL schema to create Static Generation export

Next.js ships with two forms of pre-rendering: [Static Generation](https://nextjs.org/docs/basic-features/pages#static-generation-recommended) and [Server-side Rendering](https://nextjs.org/docs/basic-features/pages#server-side-rendering). This example shows how to perform Static Generation using a local [Apollo GraphQL Server ](https://www.apollographql.com/docs/apollo-server/) schema within [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching/get-static-props) and [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching/get-static-paths.md). The end result is a Next.js application that uses one Apollo GraphQL schema to generate static pages at build time and also serve a GraphQL [API Route](https://nextjs.org/docs/api-routes/introduction) at runtime. The integration with Next and Apollo Server is implemented using the [apollo-server-integration-next](https://github.com/apollo-server-integrations/apollo-server-integration-next) community package.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/api-routes-apollo-server)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes-apollo-server&project-name=api-routes-apollo-server&repository-name=api-routes-apollo-server)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example api-routes-apollo-server api-routes-apollo-server-app
```

```bash
yarn create next-app --example api-routes-apollo-server api-routes-apollo-server-app
```

```bash
pnpm create next-app --example api-routes-apollo-server api-routes-apollo-server-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

### Static Export

If you wish to export a static HTML + JS version of the site you need to first change the setting in this example in `./pages/[username].js` where `getStaticPaths` has `fallback: true` - this needs to be `false` for static export to work. You can then run `npm run build` and `npm run export` to export the site as a static folder in `./out` directory.

[Read more about fallback option](https://nextjs.org/docs/basic-features/data-fetching#the-fallback-key-required)
