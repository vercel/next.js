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
      experimental: Object.assign({}, nextConfig?.experimental, {
        turbo: Object.assign({}, nextConfig?.experimental?.turbo, {
          rules: Object.assign({}, nextConfig?.experimental?.turbo?.rules, {
            '*.mdx': {
              loaders: [loader],
              as: '*.tsx',
            },
          }),
          resolveAlias: Object.assign(
            {},
            nextConfig?.experimental?.turbo?.resolveAlias,
            {
              'next-mdx-import-source-file':
                '@vercel/turbopack-next/mdx-import-source',
            }
          ),
        }),
      }),
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
