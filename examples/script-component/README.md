## Example app using `next/script`

This example shows how to use Next.js along with `next/script` component. Before the release of `next/script` you had to use a `<script>` along with `dangerouslySetInnerHTML` to load third party browser libraries like [Google Analytics](../with-google-analytics). We will create a component that loads the script and saves the added global variable to a local state.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/script-component&project-name=script-component&repository-name=script-component)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example script-component script-component-app
# or
yarn create next-app --example script-component script-component-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_GOOGLE_ANALYTICS_UA` variable in `.env.local` to match your Google Tag Manager ID.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
