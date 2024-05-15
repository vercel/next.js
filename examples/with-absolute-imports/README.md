# Absolute Imports and Aliases

This example shows how to configure [Absolute imports and Module path aliases](https://nextjs.org/docs/advanced-features/module-path-aliases) in `tsconfig.json` (or `jsconfig.json` for JavaScript projects). These options will allow absolute imports from `.` (the root directory), and allow you to create custom import aliases.

If you’re working on a large project, your relative import statements might suffer from `../../../` spaghetti:

```tsx
import Button from "../../../components/button";
```

In such cases, we might want to setup absolute imports using the `baseUrl` option, for clearer and shorter imports:

```tsx
import Button from "components/button";
```

Furthermore, TypeScript also supports the `paths` option, which allows you to configure custom module aliases. You can then use your alias like so:

```tsx
import Button from "@/components/button";
```

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-absolute-imports)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-absolute-imports&project-name=with-absolute-imports&repository-name=with-absolute-imports)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-absolute-imports with-absolute-imports-app
```

```bash
yarn create next-app --example with-absolute-imports with-absolute-imports-app
```

```bash
pnpm create next-app --example with-absolute-imports with-absolute-imports-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
