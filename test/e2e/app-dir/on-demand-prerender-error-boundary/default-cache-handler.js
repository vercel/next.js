const {
  createDefaultCacheHandler,
} = require('next/dist/server/lib/cache-handlers/default')

// Do not retain the page's 'use cache' result between prerenders. Each
// prerender must read updated test data without invalidating the full-route
// cache, so the tests can also verify retention of successful pages.
module.exports = createDefaultCacheHandler(0)
