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
}

module.exports = nextConfig
