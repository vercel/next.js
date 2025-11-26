if (process.env.NEXT_RUNTIME === 'edge') {
  module.exports = require('next/dist/server/route-modules/app-route/module.js')
} else {
  if (process.env.__NEXT_EXPERIMENTAL_REACT) {
    if (process.env.NODE_ENV === 'development') {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-route-turbo-experimental.runtime.dev.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-route-experimental.runtime.dev.js')
      }
    } else {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-route-turbo-experimental.runtime.prod.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-route-experimental.runtime.prod.js')
      }
    }
  } else {
    if (process.env.NODE_ENV === 'development') {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-route-turbo.runtime.dev.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-route.runtime.dev.js')
      }
    } else {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-route-turbo.runtime.prod.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-route.runtime.prod.js')
      }
    }
  }
}
