const MiniCssExtractPlugin = require('extract-css-chunks-webpack-plugin')
const findUp = require('find-up')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')

const fileExtensions = new Set()
let extractCssInitialized = false

module.exports = (
  config,
  {
    extensions = [],
    cssModules = false,
    cssLoaderOptions = {},
    dev,
    isServer,
    postcssLoaderOptions = {},
    loaders = []
  }
) => {
  for (const extension of extensions) {
    fileExtensions.add(extension)
  }

  if (!isServer) {
    config.optimization.splitChunks.cacheGroups.styles = {
      name: 'styles',
      test: new RegExp(`\\.+(${[...fileExtensions].join('|')})$`),
      chunks: 'all',
      enforce: true
    }
  }

  if (!isServer && !extractCssInitialized) {
    config.plugins.push(new MiniCssExtractPlugin({
      filename: dev
        ? 'static/chunks/[name].css'
        : 'static/chunks/[name].[contenthash:8].css',
      chunkFilename: dev
        ? 'static/chunks/[name].chunk.css'
        : 'static/chunks/[name].[contenthash:8].chunk.css',
      hot: dev,
      ignoreOrder: true
    }))

    if (!dev) {
      if (!Array.isArray(config.optimization.minimizer)) {
        config.optimization.minimizer = []
      }

      config.optimization.minimizer.push(
        new OptimizeCssAssetsWebpackPlugin({
          cssProcessorOptions: {
            discardComments: { removeAll: true }
          }
        })
      )
    }

    extractCssInitialized = true
  }

  const postcssConfigPath = findUp.sync('postcss.config.js', {
    cwd: config.context
  })
  let postcssLoader

  if (postcssConfigPath) {
    const postcssOptionsConfig = Object.assign(
      {},
      postcssLoaderOptions.config,
      { path: postcssConfigPath }
    )

    postcssLoader = {
      loader: 'postcss-loader',
      options: Object.assign({}, postcssLoaderOptions, {
        config: postcssOptionsConfig
      })
    }
  }

  const cssLoader = {
    loader: 'css-loader',
    options: Object.assign(
      {},
      {
        modules: cssModules,
        sourceMap: dev,
        importLoaders: loaders.length + (postcssLoader ? 1 : 0),
        onlyLocals: isServer
      },
      cssLoaderOptions
    )
  }

  if (isServer && !cssLoader.options.modules) {
    return ['ignore-loader']
  }

  if (isServer && cssLoader.options.modules) {
    return [cssLoader, postcssLoader, ...loaders].filter(Boolean)
  }

  return [
    !isServer && dev && 'extracted-loader',
    !isServer && {
      loader: MiniCssExtractPlugin.loader,
      options: {
        hmr: dev,
        reloadAll: true
      }
    },
    cssLoader,
    postcssLoader,
    ...loaders
  ].filter(Boolean)
}
