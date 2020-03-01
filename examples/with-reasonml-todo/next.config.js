const withTM = require('next-transpile-modules')(['bs-platform'])

module.exports = withTM({
  pageExtensions: ['jsx', 'js', 'bs.js'],
})
