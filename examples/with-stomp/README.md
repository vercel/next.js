# Stomp example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-stomp with-stomp-app
# or
yarn create next-app --example with-stomp with-stomp-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-stomp
cd with-stomp
```

Install it and run:

```bash
npm install
STOMP_SERVER=wss://some.stomp.server npm run dev
# or
yarn
STOMP_SERVER=wss://some.stomp.server yarn dev
```

You'll need to provide the STOMP url of your server in `STOMP_SERVER`

> If you're on Windows you may want to use [cross-env](https://www.npmjs.com/package/cross-env)

## The idea behind the example

This example show how to use [STOMP](http://stomp.github.io/) inside a Next.js application.

STOMP is a simple text-orientated messaging protocol. It defines an interoperable wire format so that any of the available STOMP clients can communicate with any STOMP message broker.

Read more about [STOMP](http://jmesnil.net/stomp-websocket/doc/) protocol.
