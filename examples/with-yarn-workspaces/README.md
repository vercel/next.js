# Yarn workspaces example

Workspaces are a new way to setup your package architecture that’s available by default starting from Yarn 1.0. It allows you to setup multiple packages in such a way that you only need to run yarn install once to install all of them in a single pass.

In this example we have three workspaces:

- **web-app**: A Next.js app
- **foo**: A normal node module
- **bar**: A react component, that gets compiled by Next.js (see [packages/web-app/next.config.js](./packages/web-app/next.config.js) for more info)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-yarn-workspaces)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-yarn-workspaces&project-name=with-yarn-workspaces&repository-name=with-yarn-workspaces)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-yarn-workspaces with-yarn-workspaces-app
```

```bash
yarn create next-app --example with-yarn-workspaces with-yarn-workspaces-app
```

```bash
pnpm create next-app --example with-yarn-workspaces with-yarn-workspaces-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

> Choose `packages/web-app` as root directory when deploying.

## Useful Links

- [Documentation](https://yarnpkg.com/en/docs/workspaces)
- [yarn workspace](https://yarnpkg.com/lang/en/docs/cli/workspace)
- [yarn workspaces](https://yarnpkg.com/lang/en/docs/cli/workspaces)
- [next-transpile-modules](https://www.npmjs.com/package/next-transpile-modules)
