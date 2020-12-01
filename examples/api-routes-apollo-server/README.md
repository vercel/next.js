# Consume local Apollo GraphQL schema to create Static Generation export

Next.js ships with two forms of pre-rendering: [Static Generation](https://nextjs.org/docs/basic-features/pages#static-generation-recommended) and [Server-side Rendering](https://nextjs.org/docs/basic-features/pages#server-side-rendering). This example shows how to perform Static Generation using a local [Apollo GraphQL](https://www.apollographql.com/docs/apollo-server/) schema within [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation) and [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation). The end result is a Next.js application that uses one Apollo GraphQL schema to generate static pages at build time and also serve a GraphQL [API Route](https://nextjs.org/docs/api-routes/introduction) at runtime.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/api-routes-apollo-server)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example api-routes-apollo-server api-routes-apollo-server-app
# or
yarn create next-app --example api-routes-apollo-server api-routes-apollo-server-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

### Static Export

If you wish to export a static HTML + JS version of the site you need to first change the setting in this example in `./pages/[username].js` where `getStaticPaths` has `fallback: true` - this needs to be `false` for static export to work. You can then run `npm run build` and `npm run export` to export the site as a static folder in `./out` directory.

[Read more about fallback option](https://nextjs.org/docs/basic-features/data-fetching#the-fallback-key-required)
