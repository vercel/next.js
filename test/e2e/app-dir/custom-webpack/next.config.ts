import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    customWebpack: process.env.CUSTOM_WEBPACK === 'true',
    webpackBuildWorker: true,
  },
  webpack(config, { webpack }) {
    if (process.env.EXPECTED_WEBPACK_VERSION) {
      if (webpack.version !== process.env.EXPECTED_WEBPACK_VERSION) {
        throw new Error(
          `Expected webpack ${process.env.EXPECTED_WEBPACK_VERSION}, received ${webpack.version}`
        )
      }

      config.plugins.push(
        new webpack.DefinePlugin({
          'process.env.ACTIVE_WEBPACK_VERSION': JSON.stringify(webpack.version),
        })
      )
    }

    return config
  },
}

export default nextConfig
