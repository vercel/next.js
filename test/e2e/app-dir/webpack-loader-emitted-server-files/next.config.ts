import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  cacheComponents: false,
  turbopack: {
    rules: {
      '*.template': {
        loaders: [
          {
            loader: './loader.js',
            options: { development: process.env.NODE_ENV === 'development' },
          },
        ],
        as: '*.js',
      },
      '*.pure': { loaders: ['./pure-loader.js'], as: '*.js' },
    },
  },
  webpack(config, { dev }) {
    config.module.rules.push(
      {
        test: /\.template$/,
        use: [
          {
            loader: require.resolve('./loader.js'),
            options: { development: dev },
          },
        ],
      },
      { test: /\.pure$/, use: [require.resolve('./pure-loader.js')] }
    )
    return config
  },
}

export default nextConfig
