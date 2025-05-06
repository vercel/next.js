# Next.js + Webpack Bundle Analyzer

Use `webpack-bundle-analyzer` in your Next.js project

## Installation

```
npm install @next/bundle-analyzer
```

or

```
yarn add @next/bundle-analyzer
```

Note: if installing as a `devDependency` make sure to wrap the require in a `process.env` check as `next.config.js` is loaded during `next start` as well.

### Usage with environment variables

Create a next.config.js (and make sure you have next-bundle-analyzer set up)

```js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
module.exports = withBundleAnalyzer({})
```

Or configuration as a function:

```js
module.exports = (phase, defaultConfig) => {
  return withBundleAnalyzer(defaultConfig)
}
```

Then you can run the command below:

```bash
# Analyze is done on build when env var is set
ANALYZE=true yarn build
```

When enabled three HTML files (client.html, edge.html and nodejs.html) will be outputted to `<distDir>/analyze/`. One will be for the nodejs server bundle, one for the edge server bundle, and one for the browser bundle.

#### Options

To disable automatically opening the report in your default browser, set `openAnalyzer` to false:

```js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})
module.exports = withBundleAnalyzer({})
```

To generate a json report, set `analyzerMode` to `'json'`:

```js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  analyzerMode: 'json',
})
module.exports = withBundleAnalyzer({})
```

### Usage with next-compose-plugins

From version 2.0.0 of next-compose-plugins you need to call bundle-analyzer in this way to work

```js
const withPlugins = require('next-compose-plugins')
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withPlugins([
  [withBundleAnalyzer],
  // your other plugins here
])
```
