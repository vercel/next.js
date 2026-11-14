import type { NextConfig } from 'next'

const producer = require.resolve('./loaders/produce-map.cjs')
const consumer = require.resolve('./loaders/consume-map.cjs')

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.split.js': [{ loaders: [producer] }, { loaders: [consumer] }],
      '*.chain.js': { loaders: [consumer, producer] },
      '*.plain.js': { loaders: [consumer] },
    },
  },
  webpack(config) {
    config.module.rules.push(
      { test: /\.split\.js$/, use: [consumer] },
      { test: /\.split\.js$/, use: [producer] },
      { test: /\.chain\.js$/, use: [consumer, producer] },
      { test: /\.plain\.js$/, use: [consumer] }
    )
    return config
  },
}

export default nextConfig
