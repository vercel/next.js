module.exports = (pluginOptions = {}) => (nextConfig = {}) => {
  const extension = pluginOptions.extension || /\.mdx$/
  const loader = pluginOptions.loader || require.resolve('@mdx-js/loader')

  return Object.assign({}, nextConfig, {
    webpack(config, options) {
      config.module.rules.push({
        test: extension,
        use:
          typeof pluginOptions.options === 'function'
            ? (info) => [
                options.defaultLoaders.babel,
                { loader, options: pluginOptions.options(info) },
              ]
            : [
                options.defaultLoaders.babel,
                { loader, options: pluginOptions.options },
              ],
      })

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, options)
      }

      return config
    },
  })
}
