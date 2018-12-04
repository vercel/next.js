const withCSS = require('@zeit/next-css')
const withSASS = require('@zeit/next-sass')

module.exports = withSASS(
  withCSS({
    webpack: (config, {}) => {
      config.module.rules.push({
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        loader: 'url-loader?limit=100000',
      })

      return config
    },
  })
)
