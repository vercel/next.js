const path = require('node:path')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.ts': {
        loaders: [path.resolve(__dirname, './loader.js')],
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.ts$/,
      use: [path.resolve(__dirname, './loader.js')],
    })
    return config
  },
}

module.exports = nextConfig
