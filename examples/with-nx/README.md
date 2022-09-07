# Example app using Nx

**NOTE:** When using Nx on Vercel, ensure you are using `nx@14.6.2` or above.

This example was created using [Nx](https://nx.dev).

## Deploy your own

Deploy this example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-nx&project-name=with-nx&repository-name=with-nx&output-directory=dist%2Fapps%2Fapp%2F.next&build-command=npx%20nx%20build%20app%20--prod&ignore-command=npx%20nx-ignore%20app%20)

# How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-nx
```

```bash
yarn create next-app --example with-nx
```

```bash
pnpm create next-app --example with-nx
```

## Development server

Run `nx serve app` for a dev server. Navigate to http://localhost:4200/. The app will automatically reload if you change any of the source files.

## Build

Run `nx build app` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `nx test app` to execute the unit tests via [Jest](https://jestjs.io).

Run `nx affected:test` to execute the unit tests affected by a change.

## Code scaffolding

Run `nx g @nrwl/react:component my-component --project=app` to generate a new component.

## Generate an application

Run `nx g @nrwl/react:app new-app` to generate an application.

> You can use any of the plugins above to generate applications as well.

When using Nx, you can create multiple applications and libraries in the same workspace.

## Generate a library

Run `nx g @nrwl/react:lib my-lib` to generate a library.

> You can also use any of the plugins above to generate libraries as well.

Libraries are shareable across libraries and applications. They can be imported from `@with-nx/mylib`.

## Further help

Visit the [Nx Documentation](https://nx.dev) to learn more.

## Nx Cloud

**NOTE:** When using Nx Cloud on Vercel, ensure:

If using `@nrwl/nx-cloud@14.6.0` or above

1. Set `NX_CACHE_DIRECTORY=/tmp/nx-cache`

If using `@nrwl/nx-cloud@14.5.0` or below

1. Set `NX_CACHE_DIRECTORY=/tmp/nx-cache`
2. Set the `cacheDirectory` option for the `@nrwl/nx-cloud` runner in your `nx.json` to match the value of the `NX_CACHE_DIRECTORY` environment variable:

```json
"runner": "@nrwl/nx-cloud",
"options": {
  // this must be the same value as `NX_CACHE_DIRECTORY`
  "cacheDirectory": "/tmp/nx-cache"
}
```

Visit [Nx Cloud](https://nx.app/) to learn more.

https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss&project-name=with-nx&repository-name=with-nx&output-directory=dist%2Fapps%2Fapp%2F.next&build-command=npx%20nx%20build%20app%20--prod
