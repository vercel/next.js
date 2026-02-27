# Next.js + OrgX

Use [OrgX](https://github.com/orgapp/orgajs/tree/main/packages/orgx) with [Next.js](https://github.com/vercel/next.js)

## Installation

```
npm install @next/org @orgajs/loader @orgajs/react
```

or

```
yarn add @next/org @orgajs/loader @orgajs/react
```

## Usage

Create a `next.config.js` in your project

```js
// next.config.js
const withOrg = require('@next/org')()
module.exports = withOrg()
```

Optionally you can provide OrgX loader options:

```js
// next.config.js
const withOrg = require('@next/org')({
  options: {},
})
module.exports = withOrg()
```

Optionally you can add your custom Next.js configuration as parameter

```js
// next.config.js
const withOrg = require('@next/org')()
module.exports = withOrg({
  webpack(config, options) {
    return config
  },
})
```

Optionally you can match other file extensions for OrgX compilation, by default only `.org` is supported

```js
// next.config.js
const withOrg = require('@next/org')({
  extension: /\.(org|orgx)$/,
})
module.exports = withOrg()
```

## Top level .org pages

Define the `pageExtensions` option to have Next.js handle `.org` files in the `pages` directory as pages:

```js
// next.config.js
const withOrg = require('@next/org')({
  extension: /\.org$/,
})
module.exports = withOrg({
  pageExtensions: ['js', 'jsx', 'org'],
})
```
