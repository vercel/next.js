const path = require('path')
module.exports = require(!process.browser ? 'next/error'
  : path.resolve(__dirname, '/../lib/error'))
