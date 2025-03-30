## Example app using Google Maps Embed

This example shows how to embed a Google Maps Embed using [`@next/third-parties`](https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-google-maps-embed)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-google-maps-embed&project-name=with-google-maps-embed&repository-name=with-google-maps-embed)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-google-maps-embed with-google-maps-embed-app
```

```bash
yarn create next-app --example with-google-maps-embed with-google-maps-embed-app
```

```bash
pnpm create next-app --example with-google-maps-embed with-google-maps-embed-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_GOOGLE_API_KEY` variable in `.env.local` to match your Google Maps API Key.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
