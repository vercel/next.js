# Next.js + Webpack Bundle Analyzer

Use `webpack-bundle-analyzer` in your Next.js project

## Installation

```
npm install --save @next/bundle-analyzer
```

or

```
yarn add @next/bundle-analyzer
```

### Usage with environment variables

Create a next.config.js (and make sure you have next-bundle-analyzer set up)

```js
const withBundleAnalyzer = require("@next/bundle-analyzer");
module.exports = withBundleAnalyzer({ 
  analyze: process.env.ANALYZE === "true"
});
```

Then you can run one of these commands:

```bash
# Analyze is done on build when env var is set
ANALYZE=true yarn build
```

If you choose both then two different browser windows will open. One will be for the server bundle, one for the browser bundle.
