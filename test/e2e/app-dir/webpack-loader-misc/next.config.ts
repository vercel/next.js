import type { NextConfig } from 'next'

const loader = require.resolve('./misc-loader.js')

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.misc-test.js': {
        loaders: [loader],
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.misc-test\.js$/,
      use: loader,
    })
    return config
  },
}

export default nextConfig
