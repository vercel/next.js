import type { NextConfig } from 'next'

const loader = require.resolve('./mode-loader.js')

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.mode-test.js': {
        loaders: [loader],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.mode-test\.js$/,
      use: loader,
    })
    return config
  },
}

export default nextConfig
