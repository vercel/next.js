# Custom Image Loader example

Next.js is designed to create universal apps and optimized screens. Nextjs needs a loader for images to generate unnecessary load and for optimized processing.

Here we will design a Custom loader and load the pictures.
[next/image props](https://nextjs.org/docs/api-reference/next/image#required-props).

 
## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/custom-image-loader?runScript=dev)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/custom-image-loader)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:
````jsx
 module.exports={
  reactStrictMode: true, default
    trailingSlash: true, ------> +
    images: {            ------> +
      loader: "custom"   ------> +
    },                   ------> +
}
````

```bash
npx create-next-app --example custom-image-loader custom-image-loader-app
# or
yarn create next-app --example custom-image-loader custom-image-loader-app
```
