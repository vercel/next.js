const { join } = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    rules: {
      '*.svg': {
        as: '*.js',
        loaders: [join(__dirname, './custom-loader.js')],
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [join(__dirname, './custom-loader.js')],
    })

    return config
  },
}

module.exports = nextConfig
