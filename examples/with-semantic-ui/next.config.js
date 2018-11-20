const withCss = require('@zeit/next-css')

module.exports = withCss({
  webpack (config) {
    config.module.rules.push({
      test: /\.(png|svg|eot|otf|ttf|woff|woff2)$/i,
      use: {
        loader: 'url-loader',
        options: {
          limit: 8192,
          publicPath: './',
          outputPath: 'static/css/',
          name: '[name].[ext]'
        }
      }
    })

    return config
  }
})
