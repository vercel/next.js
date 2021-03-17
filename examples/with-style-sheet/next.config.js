const getCss = require('style-sheet/babel').getCss
const { RawSource } = require('webpack-sources')

class StyleSheetPlugin {
  apply(compiler) {
    compiler.hooks.emit.tap('StyleSheetPlugin', (compilation) => {
      compilation.assets['static/bundle.css'] = new RawSource(getCss())
    })
  }
}

module.exports = {
  webpack: (config, options) => {
    config.plugins.push(new StyleSheetPlugin())
    return config
  },
}
