# Socket.io example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

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

This example shows how to use [socket.io](https://socket.io/) inside a Next.js application using a custom hook. The example combines the WebSocket server with the Next server. In a production application you should consider splitting them into different services.
