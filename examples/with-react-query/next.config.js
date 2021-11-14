const Module = require('module')
const path = require('path')
const resolveFrom = require('resolve-from')

const node_modules = path.resolve(__dirname, 'node_modules')

const originalRequire = Module.prototype.require

// The following ensures that there is always only a single (and same)
// copy of React in an app at any given moment.
Module.prototype.require = function (modulePath) {
  // Only redirect resolutions to non-relative and non-absolute modules
  if (
    ['/react/', '/react-dom/', '/react-query/'].some(d => {
      try {
        return require.resolve(modulePath).includes(d)
      } catch (err) {
        return false
      }
    })
  ) {
    try {
      modulePath = resolveFrom(node_modules, modulePath)
    } catch (err) {
      //
    }
  }

  return originalRequire.call(this, modulePath)
}

module.exports = {
  webpack: config => {
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve.alias,
        react$: resolveFrom(path.resolve('node_modules'), 'react'),
        'react-query$': resolveFrom(
          path.resolve('node_modules'),
          'react-query'
        ),
        'react-dom$': resolveFrom(path.resolve('node_modules'), 'react-dom'),
      },
    }
    return config
  },
}