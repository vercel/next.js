const withTM = require('next-plugin-transpile-modules')

module.exports = withTM({
  // Tell webpack to compile the "bar" package
  transpileModules: ['bar']
})
