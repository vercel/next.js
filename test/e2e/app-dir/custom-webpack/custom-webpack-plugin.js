class CustomWebpackPlugin {
  constructor(webpackVersion) {
    this.webpackVersion = webpackVersion
  }

  apply(compiler) {
    new compiler.webpack.DefinePlugin({
      'process.env.CUSTOM_WEBPACK_PLUGIN_VALUE': JSON.stringify(
        `custom plugin with webpack ${this.webpackVersion}`
      ),
    }).apply(compiler)
  }
}

module.exports = { CustomWebpackPlugin }
