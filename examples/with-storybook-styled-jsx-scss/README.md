# Example app with Storybook setup for SCSS in Styled-jsx

This example shows Styled-jsx (with SCSS) working for components written in TypeScript rendered both inside and outside of Storybook.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-storybook-styled-jsx-scss)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-storybook-styled-jsx-scss&project-name=with-storybook-styled-jsx-scss&repository-name=with-storybook-styled-jsx-scss)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-storybook-styled-jsx-scss with-storybook-styled-jsx-scss-app
```

```bash
yarn create next-app --example with-storybook-styled-jsx-scss with-storybook-styled-jsx-scss-app
```

```bash
pnpm create next-app --example with-storybook-styled-jsx-scss with-storybook-styled-jsx-scss-app
```

### Run Storybook

```bash
npm run storybook
# or
yarn storybook
```

### Build Static Storybook

```bash
npm run build-storybook
# or
yarn build-storybook
```

You can use [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy Storybook. Specify `storybook-static` as the output directory.

## Notes

This example combines the following examples, with some required extra config added:

- [with-storybook](https://github.com/vercel/next.js/tree/canary/examples/with-storybook)
- [with-styled-jsx-scss](https://github.com/vercel/next.js/tree/canary/examples/with-styled-jsx-scss)
- [with-typescript](https://github.com/vercel/next.js/tree/canary/examples/with-typescript)
