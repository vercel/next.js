if (process.env.NEXT_RUNTIME === 'edge') {
  module.exports = require('next/dist/server/future/route-modules/pages/module.js')
} else {
  if (process.env.NODE_ENV === 'development') {
    module.exports = require('next/dist/compiled/next-server/pages.runtime.dev.js')
  } else if (process.env.TURBOPACK) {
    module.exports = require('next/dist/compiled/next-server/pages-turbo.runtime.prod.js')
  } else {
    module.exports = require('next/dist/compiled/next-server/pages.runtime.prod.js')
  }
}
