# Image Component Example

This example shows how to use the [Image Component in Next.js](https://nextjs.org/docs/api-reference/next/image) serve optimized, responsive images.

The index page ([`pages/index.js`](pages/index.js)) has a couple images, one internal image and one external image. In [`next.config.js`](next.config.js), the `domains` property is used to enable external images. The other pages demonstrate the different layouts. Run or deploy the app to see how it works!

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/image-component)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example image-component image-app
# or
yarn create next-app --example image-component image-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
