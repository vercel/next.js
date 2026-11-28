import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.txt': {
        loaders: ['./events-loader.js'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.txt$/,
      use: './events-loader.js',
    })
    return config
  },
}

export default nextConfig
