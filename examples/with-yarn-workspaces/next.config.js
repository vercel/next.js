// Tell webpack to compile the "bar" package, necessary if you're using the export statement for example
// https://www.npmjs.com/package/next-transpile-modules
const withTM = require('next-transpile-modules')(['bar'])

module.exports = withTM({
  distDir: '../../.next', // Point the output directory to the root of the repo (for deploying with next with no additional config)
})
