# Oxfmt Example

This example shows how to configure [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) to work with a Next.js application.

Oxfmt is a high-performance JavaScript/TypeScript formatter built on the Oxc compiler stack. It's approximately 30x faster than Prettier while maintaining compatible output.

In [`.oxfmtrc.json`](./.oxfmtrc.json), the following features are configured:

- **Print width**: 100 characters (accounts for TypeScript type annotations and modern screens)
- **Import sorting**: Automatically organizes imports (`experimentalSortImports`)
- **Prettier compatibility**: Matches Prettier's JavaScript formatting output

For Tailwind CSS projects, you can also enable `experimentalTailwindcss` to automatically sort Tailwind classes.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-oxfmt&project-name=with-oxfmt&repository-name=with-oxfmt)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-oxfmt with-oxfmt-app
```

```bash
yarn create next-app --example with-oxfmt with-oxfmt-app
```

```bash
pnpm create next-app --example with-oxfmt with-oxfmt-app
```

## Formatting the application

```bash
npm run format
```

```bash
yarn format
```

```bash
pnpm format
```

To check formatting without writing changes:

```bash
npm run format:check
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
