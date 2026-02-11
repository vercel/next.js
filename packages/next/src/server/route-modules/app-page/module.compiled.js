if (process.env.NEXT_RUNTIME === 'edge') {
  module.exports = require('next/dist/server/route-modules/app-page/module.js')
} else {
  // Keep this as explicit nested conditionals with branch-local `require()` calls.
  // Collapsing this into a map/object with eager requires pulls all runtime
  // variants into the module graph and breaks env-based dead-code elimination.
  if (process.env.__NEXT_EXPERIMENTAL_REACT) {
    if (process.env.__NEXT_USE_NODE_STREAMS) {
      if (process.env.NODE_ENV === 'development') {
        if (process.env.TURBOPACK) {
          module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental-nodestreams.runtime.dev.js')
        } else {
          module.exports = require('next/dist/compiled/next-server/app-page-experimental-nodestreams.runtime.dev.js')
        }
      } else {
        if (process.env.TURBOPACK) {
          module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental-nodestreams.runtime.prod.js')
        } else {
          module.exports = require('next/dist/compiled/next-server/app-page-experimental-nodestreams.runtime.prod.js')
        }
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        if (process.env.TURBOPACK) {
          module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.dev.js')
        } else {
          module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.dev.js')
        }
      } else {
        if (process.env.TURBOPACK) {
          module.exports = require('next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js')
        } else {
          module.exports = require('next/dist/compiled/next-server/app-page-experimental.runtime.prod.js')
        }
      }
    }
  } else if (process.env.__NEXT_USE_NODE_STREAMS) {
    if (process.env.NODE_ENV === 'development') {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-page-turbo-nodestreams.runtime.dev.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-page-nodestreams.runtime.dev.js')
      }
    } else {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-page-turbo-nodestreams.runtime.prod.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-page-nodestreams.runtime.prod.js')
      }
    }
  } else {
    if (process.env.NODE_ENV === 'development') {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.dev.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js')
      }
    } else {
      if (process.env.TURBOPACK) {
        module.exports = require('next/dist/compiled/next-server/app-page-turbo.runtime.prod.js')
      } else {
        module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js')
      }
    }
  }
}
