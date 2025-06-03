## Example app using Facebook Pixel

This example shows how to use Next.js along with Facebook Pixel. A custom [\_document](https://nextjs.org/docs/advanced-features/custom-document) is used to inject [base code](https://developers.facebook.com/docs/facebook-pixel/implementation/?locale=en_US). A [\_app](https://nextjs.org/docs/advanced-features/custom-app) is used to track route changes and send page views to Facebook Pixel.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-facebook-pixel&project-name=with-facebook-pixel&repository-name=with-facebook-pixel)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-facebook-pixel with-facebook-pixel-app
```

```bash
yarn create next-app --example with-facebook-pixel with-facebook-pixel-app
```

```bash
pnpm create next-app --example with-facebook-pixel with-facebook-pixel-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` variable in `.env.local` to match your facebook app's pixel ID.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
