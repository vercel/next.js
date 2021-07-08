# Pnpm workspaces example

[Pnpm](ttps://pnpm.io) has built-in support for monorepositories (AKA multi-package repositories, multi-project repositories, or monolithic repositories). You can create a workspace to unite multiple projects inside a single repository.

See: <https://pnpm.io/workspaces>

## Why use it?

If you want to get started quickly with a monorepo web-app utilising the excellent Pnpm's inbuilt workspaces feature.

This promotes better isolation and can lead to somewhat less easier to understand application architecture.

- **web-app**: A Next.js app
- **cypress**: A cypress package to run tests against the Next.js app.
- **bar**: A react component, that gets compiled by Next.js (see [packages/web-app/next.config.js](./packages/web-app/next.config.js) for more info)

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with--workspaces)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-yarn-workspaces&project-name=with-pnpm-workspaces&repository-name=with-pnpm-workspaces)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) to bootstrap the example:

```bash
npx create-next-app --example with-pnpm-workspaces with-pnpm-workspaces-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

> Choose `packages/web-app` as root directory when deploying.

## Useful Links

- [Documentation](https://pnpm.io/workspaces)
- [cypress](https://www.cypress.io/)
- [next-transpile-modules](https://www.npmjs.com/package/next-transpile-modules)
