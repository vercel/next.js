const UnoCSS = require('@unocss/webpack').default
const presetUno = require('@unocss/preset-uno').default

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack(config, context) {
    config.plugins.push(UnoCSS({ presets: [presetUno()] }))

    if (context.buildId !== 'development') {
      // * disable filesystem cache for build
      // * see: https://github.com/unocss/unocss/issues/419
      // * see: https://webpack.js.org/configuration/cache/
      config.cache = false
    }

    return config
  },
}

module.exports = nextConfig
