# Custom Koa Server example

Most of the time the default Next.js server will be enough but there are times you'll want to run your own server to integrate into an existing application. Next.js provides [a custom server api](https://nextjs.org/docs/advanced-features/custom-server).

Because the Next.js server is a Node.js module you can combine it with any other part of the Node.js ecosystem. In this case we are using [Koa](https://koajs.com/).

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/custom-server-koa)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-server-koa custom-server-koa-app
# or
yarn create next-app --example custom-server-koa custom-server-koa-app
```

## Side note: Enabling gzip compression

The most common Koa middleware for handling the gzip compression is [compress](https://github.com/koajs/compress), but unfortunately it is currently not compatible with Next.<br>
`koa-compress` handles the compression of the response body by checking `res.body`, which will be empty in the case of the routes handled by Next (because Next sends and ends the response by itself).

If you need to enable the gzip compression, the most simple way to do so is by wrapping the express-middleware [compression](https://github.com/expressjs/compression) with [koa-connect](https://github.com/vkurchatkin/koa-connect):

```javascript
const compression = require('compression')
const koaConnect = require('koa-connect')

server.use(koaConnect(compression()))
```
