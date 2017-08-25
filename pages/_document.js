const path = require('path')
module.exports = require(!process.browser ? 'next/document'
  : path.resolve(__dirname, '/../server/document'))
