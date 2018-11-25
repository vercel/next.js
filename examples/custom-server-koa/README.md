[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/custom-server-koa)

# Custom Koa Server example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example custom-server-koa custom-server-koa-app
# or
yarn create next-app --example custom-server-koa custom-server-koa-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-server-koa
cd custom-server-koa
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

Most of the times the default Next server will be enough but sometimes you want to run your own server to customize routes or other kind of the app behavior. Next provides a [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can customize as much as you want.

Because the Next.js server is just a node.js module you can combine it with any other part of the node.js ecosystem. in this case we are using [Koa](http://koajs.com/) to build a custom router on top of Next.

The example shows a server that serves the component living in `pages/a.js` when the route `/b` is requested and `pages/b.js` when the route `/a` is accessed. This is obviously a non-standard routing strategy. You can see how this custom routing is being made inside `server.js`.


## Side note: Enabling gzip compression

The most common Koa middleware for handling the gzip compression is [compress](https://github.com/koajs/compress), but unfortunately it is currently not compatible with Next.  
`koa-compress` handles the compression of the response body by checking `res.body`, which will be empty in the case of the routes handled by Next (because Next sends and ends the response by itself). 

If you need to enable the gzip compression, the most simple way to do so is by wrapping the express-middleware [compression](https://github.com/expressjs/compression) with [koa-connect](https://github.com/vkurchatkin/koa-connect):  

```javascript
const compression = require('compression');
const koaConnect = require('koa-connect');


server.use(koaConnect(compression()));

```
