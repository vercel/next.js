const withTM = require('next-transpile-modules')

module.exports = withTM({
  pageExtensions: ['jsx', 'js', 'bs.js'],
  transpileModules: ['bs-platform'],
})
