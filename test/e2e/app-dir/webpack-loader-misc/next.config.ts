import type { NextConfig } from 'next'

const loader = require.resolve('./misc-loader.js')
const optionsLoader = {
  loader: require.resolve('./options-loader.cjs'),
  options: { value: 'object', count: 2 },
}

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.misc-test.js': {
        loaders: [loader],
      },
      '*.options.js': {
        loaders: [optionsLoader],
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.misc-test\.js$/,
      use: loader,
    })
    config.module.rules.push({
      test: /\.options\.js$/,
      use: [optionsLoader],
    })
    return config
  },
}

export default nextConfig
