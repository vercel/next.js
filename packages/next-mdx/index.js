module.exports =
  (pluginOptions = {}) =>
  (nextConfig = {}) => {
    const extension = pluginOptions.extension || /\.mdx$/

    const mdxRsOptions = nextConfig?.experimental?.mdxRs
    const loader = mdxRsOptions
      ? {
          loader: require.resolve('./mdx-rs-loader'),
          options: {
            providerImportSource: 'next-mdx-import-source-file',
            ...pluginOptions.options,
            // mdxRsOptions is a union of boolean and object type of MdxTransformOptions
            ...(mdxRsOptions === true ? {} : mdxRsOptions),
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
