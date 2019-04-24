# Socket.io example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-socket.io with-socket.io-app
# or
yarn create next-app --example with-socket.io with-socket.io-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-socket.io
cd with-socket.io
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## The idea behind the example

This example show how to use [socket.io](https://socket.io/) inside a Next.js application. It uses `getInitialProps` to fetch the old messages from a HTTP endpoint as if it was a Rest API. The example combine the WebSocket server with the Next server, in a production application you should split them as different services.