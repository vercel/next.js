const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  cssModules: true,
  webpack: config => {
    config.module.rules.push({
      test: /\.js$/,
      use: ['astroturf/loader']
    })

    return config
  }
})
