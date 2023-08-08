if (process.env.NEXT_RUNTIME === 'edge') {
  module.exports = require('next/dist/server/future/route-modules/app-page/module.js')
} else {
  if (process.env.NODE_ENV === 'development') {
    module.exports = require('next/dist/compiled/next-server/app-page.runtime.dev.js')
  } else {
    module.exports = require('next/dist/compiled/next-server/app-page.runtime.prod.js')
  }
}
