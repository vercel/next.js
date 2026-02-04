# Oxlint Example

This example shows how to configure [Oxlint](https://oxc.rs/docs/guide/usage/linter) to work with a Next.js application.

Linting via Oxlint in this example includes type-aware linting through the `oxlint-tsgolint` integration, which is [in technical preview](https://oxc.rs/blog/2025-08-17-oxlint-type-aware.html) at the time of writing.

In [`.oxlintrc.json`](./.oxlintrc.json), the plugins `eslint`, `react`, `unicorn`, `typescript`, `nextjs`, and `oxc` are enabled.

The first five are [Rust-based Oxlint plugins](https://oxc.rs/docs/guide/usage/linter/plugins.html#supported-plugins) that port rules from the ESLint core and the corresponding ESLint plugins.

The `oxc` plugin provides Oxc-specific rules along with some rules ported from Deepscan.

Further, Oxlint will not lint your `.next`, `dist`, `build` and `node_modules` directories based on the configured `ignorePatterns`.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-oxlint&project-name=with-oxlint&repository-name=with-oxlint)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-oxlint with-oxlint-app
```

```bash
yarn create next-app --example with-oxlint with-oxlint-app
```

```bash
pnpm create next-app --example with-oxlint with-oxlint-app
```

## Linting the application


```bash
npm run lint
```

```bash
yarn lint
```

```bash
pnpm lint
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
