const isProd = (process.env.NODE_ENV === 'production')

module.exports = {
  assetPrefix: !isProd ? '' : 'http://localhost:3080',
  assetMap: !isProd ? null : {
    '/page/about': '/page/about/index.js',
    '/page/': '/page/index.js'
  },

  // Export just js bundles
  exportPathMap: function () {
    return {}
  }
}
