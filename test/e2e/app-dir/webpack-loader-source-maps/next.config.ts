import type { NextConfig } from 'next'

const loader = require.resolve('./add-lines-loader.js')

const nextConfig: NextConfig = {
  experimental: {
    serverSourceMaps: true,
  },
  turbopack: {
    rules: {
      '*.mapped.js': {
        loaders: [loader],
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.mapped\.js$/,
      use: [loader],
    })
    return config
  },
}

export default nextConfig
