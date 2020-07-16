# Using Next.js with filbert-js

A light weight(~1KB) css-in-js solution(framework)🎨

This example showcase how to perform SSR & extract and inline critical css with [@filbert-js/server-stylesheet](https://www.npmjs.com/package/@filbert-js/server-stylesheet) and [@filbert-js/core](https://www.npmjs.com/package/@filbert-js/core)

If you are running into any issues with this example, feel free to open-up an issue at https://github.com/kuldeepkeshwar/filbert-js/issues.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-filbert)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-filbert with-filbert-app
# or
yarn create next-app --example with-filbert with-filbert-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-filbert
cd with-filbert
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
