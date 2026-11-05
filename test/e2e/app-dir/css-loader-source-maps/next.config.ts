import type { NextConfig } from 'next'

const loader = require.resolve('./mapped-loader.cjs')

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  turbopack: {
    rules: {
      '*.mapped.module.css': {
        loaders: [loader],
      },
    },
  },
  webpack(config, { dev, webpack }) {
    if (dev) {
      config.plugins.push(
        new webpack.SourceMapDevToolPlugin({
          filename: '[file].map',
          test: /\.css$/,
        })
      )
    }
    config.module.rules.push({
      test: /\.mapped\.module\.css$/,
      use: [loader],
    })
    return config
  },
}

export default nextConfig
