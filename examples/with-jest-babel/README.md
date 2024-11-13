# Next.js + Jest

This example shows how to configure Jest to work with Next.js and Babel. Since the release of Next.js 12, Next.js has in-built configuration for Jest with SWC. See the [with-jest](https://github.com/vercel/next.js/tree/canary/examples/with-jest) example for the latest implementation.

This includes Next.js' built-in support for Global CSS, CSS Modules and TypeScript.

## How to Use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-jest-babel with-jest-babel-app
```

```bash
yarn create next-app --example with-jest-babel with-jest-babel-app
```

```bash
pnpm create next-app --example with-jest-babel with-jest-babel-app
```

## Run Jest Tests

```bash
npm test
```

```bash
yarn test
```

```bash
pnpm test
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
