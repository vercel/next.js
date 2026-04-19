# Next.js with Grafbase

This example shows to use [Grafbase](https://grafbase.com) with Next.js. This example features fetching from a local GraphQL backend powered by the Grafbase CLI, and GraphQL Code Generator for making type-safe queries.

## Demo

You can see a demo of this online at [https://nextjs-rsc-demo.grafbase-vercel.dev](https://nextjs-rsc-demo.grafbase-vercel.dev).

## Deploy to Vercel

Make sure to provide your `GRAFBASE_API_URL` and `GRAFBASE_API_KEY` to Vercel as environment variables when deploying.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-grafbase&env=GRAFBASE_API_URL,GRAFBASE_API_KEY)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-grafbase with-grafbase-app
```

```bash
yarn create next-app --example with-grafbase with-grafbase-app
```

```bash
pnpm create next-app --example with-grafbase with-grafbase-app
```

To run the example locally you need to:

1. Copy the `.env.local.example` to `.env.local` and provide your API URL and API Key: `cp .env.local.example .env.local` &mdash; the defaults will be fine for development mode.

2. Run the [Grafbase CLI](https://grafbase.com/cli) using `npx grafbase@latest dev`

3. Populate the backend with some `Post` entries using a GraphQL mutation:

```graphql
mutation {
  postCreate(
    input: {
      title: "I love Next.js!"
      slug: "i-love-nextjs"
      comments: [{ create: { message: "me too!" } }]
    }
  ) {
    post {
      id
      slug
    }
  }
}
```

4. Run the app locally and go to [http://localhost:3000](http://localhost:3000) to navigate to each post page! This data is fetched from the local backend.

5. Optionally run `npm run codegen` to watch for any changes to queries inside of the app and automatically generate types.

## Learn more

- [Grafbase Quickstart](https://grafbase.com/docs/quickstart/get-started) &mdash; get started with Grafbase, quickly!
- [Create an account](https://grafbase.com/sign-up) &mdash; deploy to the edge with Grafbase!
- [Next.js Documentation](https://nextjs.org/docs) &mdash; learn more about Next.js
