# Example app with [babel-macros](https://github.com/kentcdodds/babel-macros)

This example features how to configure and use [`babel-macros`](https://github.com/kentcdodds/babel-macros) which allows you to easily add babel plugins which export themselves as a macro without needing to configure them.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-babel-macros)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-babel-macros&project-name=with-babel-macros&repository-name=with-babel-macros)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-babel-macros with-babel-macros-app
# or
yarn create next-app --example with-babel-macros with-babel-macros-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Note

You'll notice the configuration in `.babelrc` includes the `babel-macros`
plugin, then we can use the `preval.macro` in `pages/index.js` to pre-evaluate
code at build-time. `preval.macro` is effectively transforming our code, but
we didn't have to configure it to make that happen!

Specifically what we're doing is we're prevaling the username of the user who
ran the build.
