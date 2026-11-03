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
const testLoader = './loader.js'
// Check require conditions and application aliases independently in the existing loader chain.
const testLoaders = [
  'test-resolution-loader',
  'test-resolution-loader/aliased',
  'test-resolution-loader/conditions',
  testLoader,
]
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
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  turbopack: {
    resolveAlias: {
      'build-dependency-package': './aliased-build-dependency.js',
      'test-resolution-loader/aliased': './resolution-loader/wrong.js',
    },
    rules: {
      '*.external-loader-test': {
        loaders: [process.env.EXTERNAL_LOADER],
        as: '*.js',
      },
      '*.cache-test': {
        loaders: ['./leaf-loader.js'],
        as: '*.js',
      },
      '*.ts': {
        loaders: testLoaders,
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
    config.resolve.alias['test-resolution-loader/aliased'] = path.resolve(
      __dirname,
      './resolution-loader/wrong.js'
    )
    config.module.rules.push({
      test: /\.external-loader-test$/,
      use: [process.env.EXTERNAL_LOADER],
    })
    config.module.rules.push({
      test: /\.cache-test$/,
      use: ['./leaf-loader.js'],
    })
    config.module.rules.push({
      test: /\.ts$/,
      use: testLoaders.map((loader) => require.resolve(loader)),
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
