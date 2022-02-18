# TypeScript Next.js example

This example is part of the `create-next-app` CLI as an official TypeScript template and can be used with the `--ts` or `--typescript` flag.

You can find the source code here: https://github.com/vercel/next.js/tree/canary/packages/create-next-app/templates/typescript

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-typescript)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-typescript&project-name=with-typescript&repository-name=with-typescript)

## How to use it?

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```sh
npx create-next-app --typescript with-typescript-app
# or
yarn create next-app --typescript with-typescript-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

This example shows how to integrate the TypeScript type system into Next.js. Since TypeScript is supported out of the box with Next.js, all you have to do to get started is to use this example. Alternatively, you can [install TypeScript manually](https://nextjs.org/docs/basic-features/typescript#existing-projects) to an existing project.

```sh
npm install --save-dev typescript
# or
yarn add --dev typescript
```

To enable TypeScript's features, we install the type declarations for React and Node.

```sh
npm install --save-dev @types/react @types/react-dom @types/node
# or
yarn add --dev @types/react @types/react-dom @types/node
```

When you run `next dev` the next time, Next.js will also start looking for any `.ts` or `.tsx` files. It even creates or updates the `tsconfig.json` file for your project with the recommended settings.

Next.js has built-in TypeScript declarations, so we'll get autocompletion for Next.js' modules straight away.

A `type-check` script is also added to `package.json`, which runs TypeScript's `tsc` CLI in `noEmit` mode to run type-checking separately. You can then include this, for example, in your `test` scripts.
