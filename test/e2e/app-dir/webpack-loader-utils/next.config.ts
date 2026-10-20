import type { NextConfig } from 'next'

const utilsLoader = './utils-loader.js'
const styleLoaders = ['./capture-loader.js', 'style-loader']

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.utils-test.js': { loaders: [utilsLoader] },
      '*.style-test.txt': { loaders: styleLoaders, as: '*.js' },
    },
  },
  webpack(config) {
    config.output.hashFunction = 'md4'
    config.module.rules.push(
      { test: /\.utils-test\.js$/, use: [utilsLoader] },
      { test: /\.style-test\.txt$/, use: styleLoaders }
    )
    return config
  },
}

export default nextConfig
