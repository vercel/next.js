## Example app using Google Tag Manager

This example shows how to include Google Tag Manager in a Next.js application using [`@next/third-parties`](https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries). The GTM container is instantiated in `layout.tsx` and the `sendGTMEvent` function is fired in the `EventButton` client component.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-google-tag-manager)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-google-tag-manager&project-name=with-google-tag-manager&repository-name=with-google-tag-manager)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-google-tag-manager with-google-tag-manager-app
```

```bash
yarn create next-app --example with-google-tag-manager with-google-tag-manager-app
```

```bash
pnpm create next-app --example with-google-tag-manager with-google-tag-manager-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID` variable in `.env.local` to match your Google Tag Manager ID.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
