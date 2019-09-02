# Stomp example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

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

In this example, STOMP server url comes from an environment variable, So, You need to add the env key into the next.config.js
```bash
module.exports = {
  // Build-time configuration
  env: {
    STOMP_SERVER: process.env.STOMP_SERVER
  }
}
```

```bash
npm install
cross-env STOMP_SERVER=wss://some.stomp.server npm run dev
# or
yarn
cross-env STOMP_SERVER=wss://some.stomp.server yarn dev
```

## The idea behind the example

This example show how to use [STOMP](http://stomp.github.io/) inside a Next.js application.

STOMP is a simple text-orientated messaging protocol. It defines an interoperable wire format so that any of the available STOMP clients can communicate with any STOMP message broker.


## Note
Read more about [STOMP](http://jmesnil.net/stomp-websocket/doc/) protocol.

Just in case you need to set the `STOMP_SERVER` on runtime, you can set a [runtime-configuration](https://nextjs.org/docs#runtime-configuration) like this:
```bash
module.exports = {
  // Run-time configuration
  publicRuntimeConfig: {
    stompServer: process.env.STOMP_SERVER
  }
}
```
Then access it inside `useClient.js` like this:
```bash
// useClient.js
import getConfig from 'next/config'
// ...
const { publicRuntimeConfig } = getConfig()
stompClient = Stomp.client(publicRuntimeConfig.stompServer)
```