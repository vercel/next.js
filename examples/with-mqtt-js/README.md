# MQTT Client example

This example shows how to use the MQTT.js client with next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-mqtt-js)

## How to use

```bash
npx create-next-app --example with-mqtt-js with-mqtt-js-app
# or
yarn create-next-app --example with-mqtt-js with-mqtt-js-app
```

SET a connection URI, options for the mqtt connection in .env.local and define handlers per topic for incomming messages in the code of the page you want to use the client in.
Then pass the variables and handlers to the useMqtt hook that returns a connected client instance.

**MQTT.js**

For more information on the mqtt client or the options object, consult the documentation: [MQTT.js](https://github.com/mqttjs/MQTT.js)

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
