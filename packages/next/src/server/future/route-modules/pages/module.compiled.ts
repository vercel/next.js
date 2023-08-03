if (process.env.NODE_ENV === 'production') {
  module.exports = require('next/dist/compiled/next-server/pages.runtime.prod.js')
} else {
  module.exports = require('next/dist/compiled/next-server/pages.runtime.dev.js')
}
