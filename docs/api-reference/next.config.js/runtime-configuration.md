# Runtime Configuration

> Generally you'll want to use [build-time environment variables](https://www.notion.so/zeithq/Environment-Variables-23d823eb43524b08aa5829b65e2f18f1) to provide your configuration. The reason for this is that runtime configuration adds rendering / initialization overhead and is incompatible with [Automatic Static Optimization](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d).

> Runtime configuration is not available when using the [`serverless` target](https://www.notion.so/zeithq/Build-target-4db30a2386aa4c7f9777fee68fd59c1b#2799caa63a82412bb86571a1f3c4c1d7).

To add runtime configuration to your app open `next.config.js` and add the `publicRuntimeConfig` and `serverRuntimeConfig` configs:

```js
module.exports = {
  serverRuntimeConfig: {
    // Will only be available on the server side
    mySecret: 'secret',
    secondSecret: process.env.SECOND_SECRET, // Pass through env variables
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    staticFolder: '/static',
  },
}
```

Place any server-only runtime config under `serverRuntimeConfig`.

Anything accessible to both client and server-side code should be under `publicRuntimeConfig`.

> A page that relies on `publicRuntimeConfig` **must** use `getInitialProps` to opt-out of [Automatic Static Optimization](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d).

To get access to the runtime configs in your app use `next/config`, like so:

```jsx
import getConfig from 'next/config'

// Only holds serverRuntimeConfig and publicRuntimeConfig
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig()
// Will only be available on the server-side
console.log(serverRuntimeConfig.mySecret)
// Will be available on both server-side and client-side
console.log(publicRuntimeConfig.staticFolder)

function MyImage() {
  return (
    <div>
      <img src={`${publicRuntimeConfig.staticFolder}/logo.png`} alt="logo" />
    </div>
  )
}

export default MyImage
```
