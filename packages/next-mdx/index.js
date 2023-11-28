module.exports =
  (pluginOptions = {}) =>
  (nextConfig = {}) => {
    const extension = pluginOptions.extension || /\.mdx$/

    const loader = nextConfig?.experimental?.mdxRs
      ? {
          loader: require.resolve('./mdx-rs-loader'),
          options: {
            providerImportSource: 'next-mdx-import-source-file',
            ...pluginOptions.options,
          },
        }
      : {
          loader: require.resolve('@mdx-js/loader'),
          options: {
            providerImportSource: 'next-mdx-import-source-file',
            ...pluginOptions.options,
          },
        }

    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        config.resolve.alias['next-mdx-import-source-file'] = [
          'private-next-root-dir/src/mdx-components',
          'private-next-root-dir/mdx-components',
          '@mdx-js/react',
        ]
        config.module.rules.push({
          test: extension,
          use: [options.defaultLoaders.babel, loader],
        })

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }

        return config
      },
    })
  }
