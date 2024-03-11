# MQTT Client example

This example shows how to use [MQTT.js](https://github.com/mqttjs/MQTT.js) with Next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mqtt-js&project-name=with-mqtt-js&repository-name=with-mqtt-js)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-mqtt-js with-mqtt-js-app
```

```bash
yarn create next-app --example with-mqtt-js with-mqtt-js-app
```

```bash
pnpm create next-app --example with-mqtt-js with-mqtt-js-app
```

To set up a connection URI with a mqtt client, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `NEXT_MQTT_URI`: The URI of the broker. For example `wss://test.mosquitto.org:8081/mqtt`
- `NEXT_MQTT_CLIENTID`: An arbitrary string of max. 23 characters.
- `NEXT_MQTT_USERNAME`: The username for the connection to the broker.
- `NEXT_MQTT_PASSWORD`: The password for the connection to the broker.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
