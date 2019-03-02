const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  webpack(config, options) {
    const jsRule = config.module.rules.findIndex(loader => loader.test.test('test.jsx'))
    // Dirty dirty dirty hack to make the zero runtime stuff work
    config.module.rules[jsRule].use = [
      config.module.rules[jsRule].use,
      {
        loader: 'linaria/loader',
        options: {
          sourceMap: process.env.NODE_ENV !== 'production',
        },
      },
    ]

    return config
  },
})
