## Example app using the X Pixel

This example shows how to include the [X Pixel](https://help.x.com/en/business-and-advertising/conversion-tracking-for-websites) in a Next.js application. The `XPixel` Client Component in `layout.tsx` loads the X conversion tracking base code with [`next/script`](https://nextjs.org/docs/app/api-reference/components/script) and sends a page view on every client-side navigation. The `sendXEvent` function is fired in the `EventButton` Client Component.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-x-pixel&project-name=with-x-pixel&repository-name=with-x-pixel)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-x-pixel with-x-pixel-app
```

```bash
yarn create next-app --example with-x-pixel with-x-pixel-app
```

```bash
pnpm create next-app --example with-x-pixel with-x-pixel-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_X_PIXEL_ID` variable in `.env.local` to your pixel ID from X Ads Events Manager. To send the purchase event, create an event in Events Manager and set `NEXT_PUBLIC_X_PURCHASE_EVENT_ID` to its event ID (it looks like `tw-abc12-def34`). Each event you create has its own ID.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
