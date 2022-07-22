const { join } = require('path')

const { NodeModuleTracePlugin } = require('../..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer, dev }) => {
    if (!dev && isServer) {
      const nodeModuleTracePlugin = new NodeModuleTracePlugin({
        path: join(__dirname, '..', '..', '..', '..', 'target', 'debug'),
      })
      if (config.plugins?.length) {
        config.plugins.push(nodeModuleTracePlugin)
      } else {
        config.plugins = [nodeModuleTracePlugin]
      }
    }
    return config
  },
  outputFileTracing: true,
}

module.exports = nextConfig
