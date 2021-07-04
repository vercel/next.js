# Example app with Styled Components and Typescript

This example features how you use [Styled Components](https://github.com/styled-components/styled-components) in combination with Typescript.
Additionally we set up a very basic implementation of [themes](app/css/theme.ts), featuring a light and dark mode, passed into styled-components' `ThemeProvider` on `_app` level.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-styled-components-typescript)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-styled-components-typescript&project-name=with-styled-components-typescript&repository-name=with-styled-components-typescript)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-styled-components-typescript with-styled-components-typescript-app
# or
yarn create next-app --example with-styled-components-typescript with-styled-components-typescript-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Try it on CodeSandbox

[Open this example on CodeSandbox](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/with-styled-components-typescript)

### Notes

If you're not planning to use different themes such as dark and light mode, the respective themes can be replaced with a single theme.
