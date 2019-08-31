const withTM = require('next-transpile-modules')
const path = require('path')

// Tell webpack to compile the "bar" package
// https://www.npmjs.com/package/next-transpile-modules
module.exports = withTM({
  transpileModules: ['bar'],

  // Add this if you want webpack to resolve the absolute import
  // paths that are internal to the transpiled module
  // (e.g. if you had the "paths" option set in bar/tsconfig.json)
  webpack: function (config) {
    const rootDirOfEntireProject = path.resolve('../../')
    const bar = path.join(rootDirOfEntireProject, 'node_modules/bar')
    config.resolve.modules.push(bar)
    return config
  }
})
