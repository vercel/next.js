# next-rspack (EXPERIMENTAL)

> [!WARNING]
> This package is currently experimental and actively developed and supported in Next.js’ `canary` branch. To use this, you must be using a published canary build of Next.js.

This plugin allows you to use [Rspack](https://rspack.dev) in place of webpack with Next.js.

## Installation

```
npm install next-rspack
```

or

```
yarn add next-rspack
```

## Usage

Create or update a `next.config.js`/`next.config.ts` and wrap your existing configuration:

```js
const withRspack = require('next-rspack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
}

module.exports = withRspack(nextConfig)
```

## Usage with next-compose-plugins

Alternatively, you can use `next-compose-plugins` to quickly integrate `next-rspack` with other Next.js plugins:

```js
const withPlugins = require('next-compose-plugins')
const withRspack = require('next-rspack')

module.exports = withPlugins([
  [withRspack],
  // your other plugins here
])
```
