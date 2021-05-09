module.exports = function craCompat(config) {
  return {
    ...config,

    webpack(webpackCfg, ctx) {
      const { webpack, isServer } = ctx

      // CRA prevents loading all locales by default
      // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L721
      webpackCfg.plugins.push(
        new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
      )

      // CRA allows importing non-webpack handled files with file-loader
      // which we need to ignore in server mode, these need to be the
      // last rule to prevent catching other items
      // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L594

      const fileLoaderExclude = [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/]
      let fileLoader

      if (isServer) {
        fileLoader = {
          loader: require.resolve('next/dist/compiled/file-loader'),
          // Exclude `js` files to keep "css" loader working as it injects
          // its runtime that would otherwise be processed through "file" loader.
          // Also exclude `html` and `json` extensions so they get processed
          // by webpacks internal loaders.
          exclude: fileLoaderExclude,
          options: {
            name: 'static/media/[name].[hash:8].[ext]',
          },
        }
      } else {
        fileLoader = {
          loader: require.resolve('next/dist/compiled/file-loader'),
          // Exclude `js` files to keep "css" loader working as it injects
          // its runtime that would otherwise be processed through "file" loader.
          // Also exclude `html` and `json` extensions so they get processed
          // by webpacks internal loaders.
          exclude: fileLoaderExclude,
          options: {
            name: 'static/media/[name].[hash:8].[ext]',
          },
        }
      }

      webpackCfg.module.rules = [
        {
          oneOf: [
            ...webpackCfg.module.rules.map((rule) => {
              if (rule.oneOf) {
                rule.oneOf.push(fileLoader)
              }
              return rule
            }),
            fileLoader,
          ],
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
