# Custom server using Hapi example

Most of the time the default Next.js server will be enough but there are times you'll want to run your own server to integrate into an existing application. Next.js provides [a custom server api](https://nextjs.org/docs/advanced-features/custom-server).

Because the Next.js server is a Node.js module you can combine it with any other part of the node.js ecosystem. In this case we are using [Hapi](https://hapijs.com).

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/custom-server-hapi)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-server-hapi custom-server-hapi-app
# or
yarn create next-app --example custom-server-hapi custom-server-hapi-app
```
