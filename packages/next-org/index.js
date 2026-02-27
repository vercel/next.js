module.exports =
  (pluginOptions = {}) =>
  (nextConfig = {}) => {
    const extension = pluginOptions.extension || /\.org$/

    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        config.module.rules.push({
          test: extension,
          use: [
            options.defaultLoaders.babel,
            {
              loader: require.resolve('@orgajs/loader'),
              options: pluginOptions.options,
            },
          ],
        })

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }

        return config
      },
    })
  }
