const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  webpack(config, options) {
    config.module.rules.push({
      test: /\.js$/,
      use: [
        {
          loader: 'linaria/loader',
          options: {
            sourceMap: process.env.NODE_ENV !== 'production',
          },
        },
      ],
    })

    return config
  },
})
