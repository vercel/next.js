---
description: Next.js supports TypeScript by default and has built-in types for pages and the API. You can get started with TypeScript in Next.js here.
---

# TypeScript

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-typescript">TypeScript</a></li>
  </ul>
</details>

Next.js provides an integrated [TypeScript](https://www.typescriptlang.org/) experience out of the box, similar to an IDE.

To get started, create an empty `tsconfig.json` file in the root of your project:

```bash
touch tsconfig.json
```

Next.js will automatically configure this file with default values. Providing your own `tsconfig.json` with custom [compiler options](https://www.typescriptlang.org/docs/handbook/compiler-options.html) is also supported.

> Next.js uses Babel to handle TypeScript, which has some [caveats](https://babeljs.io/docs/en/babel-plugin-transform-typescript#caveats), and some [compiler options are handled differently](https://babeljs.io/docs/en/babel-plugin-transform-typescript#typescript-compiler-options).

Then, run `next` (normally `npm run dev` or `yarn dev`) and Next.js will guide you through the installation of the required packages to finish the setup:

```bash
npm run dev

# You'll see instructions like these:
#
# Please install typescript, @types/react, and @types/node by running:
#
#         yarn add --dev typescript @types/react @types/node
#
# ...
```

You're now ready to start converting files from `.js` to `.tsx` and leveraging the benefits of TypeScript!.

> A file named `next-env.d.ts` will be created in the root of your project. This file ensures Next.js types are picked up by the TypeScript compiler. **You cannot remove it**, however, you can edit it (but you don't need to).

> TypeScript `strict` mode is turned off by default. When you feel comfortable with TypeScript, it's recommended to turn it on in your `tsconfig.json`.

By default, Next.js will do type checking as part of `next build`. We recommend using code editor type checking during development.

If you want to silence the error reports, refer to the documentation for [Ignoring TypeScript errors](/docs/api-reference/next.config.js/ignoring-typescript-errors.md).

## Static Generation and Server-side Rendering

For `getStaticProps`, `getStaticPaths`, and `getServerSideProps`, you can use the `GetStaticProps`, `GetStaticPaths`, and `GetServerSideProps` types respectively:

```ts
import { GetStaticProps, GetStaticPaths, GetServerSideProps } from 'next'

export const getStaticProps: GetStaticProps = async (context) => {
  // ...
}

export const getStaticPaths: GetStaticPaths = async () => {
  // ...
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // ...
}
```

> If you're using `getInitialProps`, you can [follow the directions on this page](/docs/api-reference/data-fetching/getInitialProps.md#typescript).

## API Routes

The following is an example of how to use the built-in types for API routes:

```ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ name: 'John Doe' })
}
```

You can also type the response data:

```ts
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  name: string
}

export default (req: NextApiRequest, res: NextApiResponse<Data>) => {
  res.status(200).json({ name: 'John Doe' })
}
```

## Custom `App`

If you have a [custom `App`](/docs/advanced-features/custom-app.md), you can use the built-in type `AppProps` and change file name to `./pages/_app.tsx` like so:

```ts
// import App from "next/app";
import type { AppProps /*, AppContext */ } from 'next/app'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

// Only uncomment this method if you have blocking data requirements for
// every single page in your application. This disables the ability to
// perform automatic static optimization, causing every page in your app to
// be server-side rendered.
//
// MyApp.getInitialProps = async (appContext: AppContext) => {
//   // calls page's `getInitialProps` and fills `appProps.pageProps`
//   const appProps = await App.getInitialProps(appContext);

//   return { ...appProps }
// }

export default MyApp
```

## Path aliases and baseUrl

Next.js automatically supports the `tsconfig.json` `"paths"` and `"baseUrl"` options.

You can learn more about this feature on the [Module Path aliases documentation](/docs/advanced-features/module-path-aliases.md).

## Type checking next.config.js

The `next.config.js` file must be a JavaScript file as it does not get parsed by Babel or TypeScript, however you can add some type checking in your IDE using JSDoc as below:

```js
// @ts-check

/**
 * @type {import('next/dist/next-server/server/config').NextConfig}
 **/
const nextConfig = {
  /* config options here */
}

module.exports = nextConfig
```

## Incremental type checking

Since `v10.2.1` Next.js supports [incremental type checking](https://www.typescriptlang.org/tsconfig#incremental) when enabled in your `tsconfig.json`, this can help speed up type checking in larger applications.

It is highly recommended to be on at least `v4.3.2` of TypeScript to experience the [best performance](https://devblogs.microsoft.com/typescript/announcing-typescript-4-3/#lazier-incremental) when leveraging this feature.
