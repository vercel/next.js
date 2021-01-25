# Stomp example

This example show how to use [STOMP](https://stomp.github.io/) inside a Next.js application.

STOMP is a simple text-orientated messaging protocol. It defines an interoperable wire format so that any of the available STOMP clients can communicate with any STOMP message broker.

Read more about [STOMP](http://jmesnil.net/stomp-websocket/doc/) protocol.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-stomp with-stomp-app
# or
yarn create next-app --example with-stomp with-stomp-app
```

You'll need to provide the STOMP url of your server before running the app. Open [`.env`](.env) and update the `NEXT_PUBLIC_STOMP_SERVER` environment variable.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
