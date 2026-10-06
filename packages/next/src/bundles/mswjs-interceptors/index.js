// @mswjs/interceptors uses `Promise.withResolvers`, which is only available
// since Node.js 22 while Next.js still supports Node.js 20.
if (typeof Promise.withResolvers !== 'function') {
  // Using the TS source requires using TS to compile this bundle which requires
  // running TS on the all of packages/next first.
  Promise.withResolvers =
    require('next/dist/shared/lib/promise-with-resolvers').createPromiseWithResolvers
}

// @mswjs/interceptors only ships ESM entry points. Re-export it through this
// CJS entry so ncc emits a CommonJS bundle that can be `require()`d.
module.exports = require('@mswjs/interceptors/ClientRequest')
