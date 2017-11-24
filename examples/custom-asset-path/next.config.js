const isProd = (process.env.NODE_ENV === 'production')
const path = require('path')
const relativeAliases = require('./relative-alias-webpack-plugin')

module.exports = {
  assetPrefix: !isProd ? '' : 'http://localhost:3080',
  assetMap: !isProd ? null : {
    '/page/about': '/page/about/index.js',
    '/page/': '/page/index.js'
  },

  // Export just js bundles
  exportPathMap: function () {
    return {}
  },

  webpack: function (config, { dev }) {
    // For the development version, we'll use default mapping.
    // Because, it supports react hot loading and so on.
    if (dev) {
      return config
    }

    config.plugins = [
      ...config.plugins,
      relativeAliases({
        // replace it for `lib/page-loader.js`
        './get-asset-path': path.resolve('./lib/get-asset-path.js'),
        '../lib/get-asset-path': path.resolve('./lib/get-asset-path.js')
      })
    ]

    return config
  }
}
