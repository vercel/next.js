const path = require('node:path')

const cssToJsLoader = path.resolve(__dirname, './css-to-js-loader.js')
const postcssLoader = require.resolve('postcss-loader')
const postcssPlugin = path.resolve(
  __dirname,
  './postcss-build-dependency-plugin.js'
)
const stylusLoader = require.resolve('stylus-loader')
const stylusPlugin = path.resolve(
  __dirname,
  './stylus-build-dependency-plugin.js'
)
const testLoader = path.resolve(__dirname, './loader.js')
const postcssLoaders = [
  cssToJsLoader,
  {
    loader: postcssLoader,
    options: {
      postcssOptions: {
        config: false,
        plugins: {
          [postcssPlugin]: {
            dependency: path.resolve(
              __dirname,
              './utils/postcss-build-dependency.txt'
            ),
          },
        },
      },
    },
  },
]
const stylusLoaders = [
  cssToJsLoader,
  {
    loader: stylusLoader,
    options: { stylusOptions: { use: [stylusPlugin] } },
  },
]

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
        loaders: [testLoader],
      },
      '*.postcss-test': {
        loaders: postcssLoaders,
        as: '*.js',
      },
      '*.stylus-test': {
        loaders: stylusLoaders,
        as: '*.js',
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
      use: [testLoader],
    })
    config.module.rules.push({
      test: /\.postcss-test$/,
      use: postcssLoaders,
    })
    config.module.rules.push({
      test: /\.stylus-test$/,
      use: stylusLoaders,
    })
    return config
  },
}

module.exports = nextConfig
