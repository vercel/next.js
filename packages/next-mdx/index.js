module.exports =
  (pluginOptions = {}) =>
  (nextConfig = {}) => {
    const extension = pluginOptions.extension || /\.mdx$/

    const loader = nextConfig?.experimental?.mdxRs
      ? {
          loader: require.resolve('./mdx-rs-loader'),
          options: {
            providerImportSource: '@mdx-js/react',
            ...pluginOptions.options,
          },
        }
      : {
          loader: require.resolve('@mdx-js/loader'),
          options: {
            providerImportSource: '@mdx-js/react',
            ...pluginOptions.options,
          },
        }

    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        config.module.rules.push({
          test: extension,
          use: [
            nextConfig?.experimental?.mdxRs
              ? undefined
              : options.defaultLoaders.babel,
            loader,
          ].filter(Boolean),
        })

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }

        return config
      },
    })
  }
