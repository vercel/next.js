if (process.env.NEXT_RUNTIME === 'edge') {
  module.exports = require('next/dist/server/future/route-modules/app-page/module.js')
} else {
  if (process.env.__NEXT_EXPERIMENTAL_REACT) {
    if (process.env.NODE_ENV === 'development') {
      module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.dev.js')
    } else if (process.env.TURBOPACK) {
      module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js')
    } else {
      module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.prod.js')
    }
  } else {
    if (process.env.NODE_ENV === 'development') {
      module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js')
    } else if (process.env.TURBOPACK) {
      module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.prod.js')
    } else {
      module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js')
    }
  }
}
