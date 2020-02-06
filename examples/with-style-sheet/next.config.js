const getCss = require('style-sheet/babel').getCss
const { RawSource } = require('webpack-sources')

class StyleSheetPlugin {
  apply(compiler) {
    compiler.plugin('emit', (compilation, cb) => {
      compilation.assets['static/bundle.css'] = new RawSource(getCss())
      cb()
    })
  }
}

module.exports = {
  webpack: (config, options) => {
    config.plugins.push(new StyleSheetPlugin())
    return config
  },
}
