# Next.js + preact

Use [preact](https://preactjs.com/) with [Next.js](https://github.com/zeit/next.js)

## Installation

```
npm install --save @next/preact preact@next
```

or

```
yarn add @next/preact preact
```

## Usage

Create a `next.config.js` in your project

```js
// next.config.js
const withPreact = require('@next/preact')
module.exports = withPreact({
  /* config options here */
})
```
