# CDN Support with Asset Prefix

To set up a [CDN](https://en.wikipedia.org/wiki/Content_delivery_network), you can set up an asset prefix and configure your CDN's origin to resolve to the domain that Next.js is hosted on.

Open `next.config.js` and add the `assetPrefix` config:

```js
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  // Use the CDN in production and localhost for development.
  assetPrefix: isProd ? 'https://cdn.mydomain.com' : '',
}
```

Next.js will automatically use your prefix in the scripts it loads, but this has no effect whatsoever on the [public](https://www.notion.so/zeithq/Static-file-serving-dd0d3668525c45708a75ac42ef8cd4f3) folder; if you want to serve those assets over a CDN, you'll have to introduce the prefix yourself. One way of introducing a prefix that works inside your components and varies by environment is documented [in this example](https://github.com/zeit/next.js/tree/canary/examples/with-universal-configuration-build-time).
