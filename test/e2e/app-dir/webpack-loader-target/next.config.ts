import type { NextConfig } from 'next'

const loader = require.resolve('./target-loader.js')

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.target-test.js': {
        loaders: [loader],
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.target-test\.js$/,
      use: loader,
    })
    return config
  },
}

export default nextConfig
