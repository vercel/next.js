# Vitest

This example shows how to use [Vitest](https://github.com/vitest-dev/vitest) with Next.js.

The application uses Next.js support for Global CSS, CSS Modules and TypeScript. Tests run with Vitest, the Vite React plugin, and React Testing Library in jsdom. The example includes ordinary unit tests and tests that render synchronous components from the App Router.

These component tests do not run the Next.js React Server Component rendering pipeline. They do not verify async Server Components, server/client boundaries, or browser hydration. Use end-to-end tests against a running Next.js application to verify those behaviors. See the [Next.js testing guide](https://nextjs.org/docs/app/guides/testing) for the available testing approaches.

> **Note:** Since tests can be co-located alongside other files inside the App Router, we have placed those tests in `app/` to demonstrate this behavior (which is different than `pages/`). You can still place all tests in `__tests__` if you prefer.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-vitest&project-name=with-vitest&repository-name=with-vitest)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-vitest with-vitest-app
```

```bash
yarn create next-app --example with-vitest with-vitest-app
```

```bash
pnpm create next-app --example with-vitest with-vitest-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Running Tests

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
