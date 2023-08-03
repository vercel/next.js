if (process.env.NEXT_RUNTIME !== 'edge') {
  if (process.env.NODE_ENV === 'production') {
    module.exports = require('next/dist/compiled/next-server/app-route.runtime.prod.js')
  } else {
    module.exports = require('next/dist/compiled/next-server/app-route.runtime.dev.js')
  }
} else {
  module.exports = require('next/dist/server/future/route-modules/app-route/module.js')
}
