# Example app using nested components

Taking advantage of the composable nature of React components we can modularize our apps in self-contained, meaningful components. This example has a page under `app/page.tsx` that uses `app/_components/paragraph.tsx` and `app/_components/post.tsx` that can be styled and managed separately.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/nested-components)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/nested-components&project-name=nested-components&repository-name=nested-components)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example nested-components nested-components-app
```

```bash
yarn create next-app --example nested-components nested-components-app
```

```bash
pnpm create next-app --example nested-components nested-components-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
