module.exports = function craCompat(config) {
  return {
    ...config,

    NEXT_INTERNAL_CRA_COMPAT: true,

    webpack(webpackCfg, ctx) {
      const { webpack } = ctx

      // CRA prevents loading all locales by default
      // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L721
      webpackCfg.plugins.push(
        new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
      )

      // CRA allows importing non-webpack handled files with file-loader
      // these need to be the last rule to prevent catching other items
      // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L594

      const isWebpack5 = config.future && config.future.webpack5
      const fileLoaderExclude = [/\.(js|mjs|jsx|ts|tsx|json)$/]
      const fileLoader = isWebpack5
        ? {
            exclude: fileLoaderExclude,
            issuer: fileLoaderExclude,
            type: 'asset/resource',
            generator: {
              publicPath: '/_next/',
              filename: 'static/media/[name].[hash:8].[ext]',
            },
          }
        : {
            loader: require.resolve('next/dist/compiled/file-loader'),
            // Exclude `js` files to keep "css" loader working as it injects
            // its runtime that would otherwise be processed through "file" loader.
            // Also exclude `html` and `json` extensions so they get processed
            // by webpacks internal loaders.
            exclude: fileLoaderExclude,
            issuer: fileLoaderExclude,
            options: {
              publicPath: '/_next/static/media',
              outputPath: 'static/media',
              name: '[name].[hash:8].[ext]',
            },
          }

      const topRules = []
      const innerRules = []

      for (const rule of webpackCfg.module.rules) {
        if (rule.resolve) {
          topRules.push(rule)
        } else {
          if (
            rule.oneOf &&
            !(rule.test || rule.exclude || rule.resource || rule.issuer)
          ) {
            rule.oneOf.forEach((r) => innerRules.push(r))
          } else {
            innerRules.push(rule)
          }
        }
      }

      webpackCfg.module.rules = [
        ...topRules,
        {
          oneOf: [...innerRules, fileLoader],
        },
      ]

      // TODO: should we support auto-enabling WorkboxWebpackPlugin when
      // src/service-worker.js is present? https://create-react-app.dev/docs/making-a-progressive-web-app/

      if (typeof config.webpack === 'function') {
        return config.webpack(webpackCfg, ctx)
      }

      return webpackCfg
    },
  }
}
