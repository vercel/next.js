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

Note: if installing as a `devDependency` make sure to wrap the require in a `process.env` check as `next.config.mjs` is loaded during `next start` as well.

### Usage with environment variables

Create a next.config.mjs (and make sure you have next-bundle-analyzer set up)

```js
import NextBundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = NextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})
export default withBundleAnalyzer({})
```

Or configuration as a function:

```js
export default (phase, { defaultConfig }) => {
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
import NextBundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = NextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})

export default withBundleAnalyzer({})
```

### Usage with next-compose-plugins

From version 2.0.0 of next-compose-plugins you need to call bundle-analyzer in this way to work

```js
import withPlugins from 'next-compose-plugins'
import NextBundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = NextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

export default withPlugins([
  [withBundleAnalyzer],
  // your other plugins here
])
```
