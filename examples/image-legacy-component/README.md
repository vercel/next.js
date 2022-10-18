# Legacy Image Component Example

This example shows how to use the [Legacy Image Component in Next.js](https://nextjs.org/docs/api-reference/next/legacy/image) serve optimized, responsive images.

The index page ([`pages/index.js`](pages/index.js)) has a couple images, one internal image and one external image. In [`next.config.js`](next.config.js), the `domains` property is used to enable external images. The other pages demonstrate the different layouts. Run or deploy the app to see how it works!

## Live demo

[https://image-legacy-component.nextjs.gallery](https://image-legacy-component.nextjs.gallery)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/image-legacy-component)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/image-legacy-component&project-name=image-legacy-component&repository-name=image-legacy-component)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example image-legacy-component image-app
# or
yarn create next-app --example image-legacy-component image-app
# or
pnpm create next-app --example image-legacy-component image-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
