const path = require('node:path')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      'build-dependency-package': './aliased-build-dependency.js',
    },
    rules: {
      '*.ts': {
        loaders: [path.resolve(__dirname, './loader.js')],
      },
    },
  },
  webpack: (config) => {
    config.resolve.alias['build-dependency-package'] = path.resolve(
      __dirname,
      './aliased-build-dependency.js'
    )
    config.module.rules.push({
      test: /\.ts$/,
      use: [path.resolve(__dirname, './loader.js')],
    })
    return config
  },
}

module.exports = nextConfig
