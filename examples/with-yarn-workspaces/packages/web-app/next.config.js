const withTM = require('next-plugin-transpile-modules')

// Tell webpack to compile the "bar" package
// https://www.npmjs.com/package/next-plugin-transpile-modules
module.exports = withTM({
  transpileModules: ['bar']
})
