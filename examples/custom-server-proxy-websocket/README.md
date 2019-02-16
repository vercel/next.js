# Custom server with Proxying onDemandEntries WebSocket

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example custom-server-proxy-websocket custom-server-proxy-websocket
# or
yarn create next-app --example custom-server-proxy-websocket custom-server-proxy-websocket
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-server-proxy-websocket
cd custom-server-proxy-websocket
```

Install it and run:

```bash
npm install
npm run ssl
npm run dev
# or
yarn
yarn ssl
yarn dev
```

## The idea behind the example

The example shows how you can use SSL with a custom server and still use onDemandEntries WebSocket from Next.js using [node-http-proxy](https://github.com/nodejitsu/node-http-proxy#readme) and [ExpressJS](https://github.com/expressjs/express).
