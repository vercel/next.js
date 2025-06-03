module.exports =
  (pluginOptions = {}) =>
  (inputConfig = {}) => {
    const extension = pluginOptions.extension || /\.mdx$/
    const userProvidedMdxOptions = pluginOptions.options

    const mdxRsOptions = inputConfig?.experimental?.mdxRs
    const loader = mdxRsOptions
      ? {
          loader: require.resolve('./mdx-rs-loader'),
          options: {
            providerImportSource: 'next-mdx-import-source-file',
            ...userProvidedMdxOptions,
            // mdxRsOptions is a union of boolean and object type of MdxTransformOptions
            ...(mdxRsOptions === true ? {} : mdxRsOptions),
          },
        }
      : {
          loader: require.resolve('./mdx-js-loader'),
          options: {
            providerImportSource: 'next-mdx-import-source-file',
            ...userProvidedMdxOptions,
          },
        }

    /**
     * @type {import('next').NextConfig}
     */
    let nextConfig = Object.assign({}, inputConfig, {
      webpack(config, options) {
        config.resolve.alias['next-mdx-import-source-file'] = [
          'private-next-root-dir/src/mdx-components',
          'private-next-root-dir/mdx-components',
          '@mdx-js/react',
          require.resolve('./mdx-components.js'),
        ]
        config.module.rules.push({
          test: extension,
          use: [options.defaultLoaders.babel, loader],
        })

        if (typeof inputConfig.webpack === 'function') {
          return inputConfig.webpack(config, options)
        }

        return config
      },
    })

    if (process.env.TURBOPACK) {
      nextConfig.turbopack = Object.assign({}, nextConfig?.turbopack, {
        rules: Object.assign({}, nextConfig?.turbopack?.rules, {
          '#next-mdx': {
            loaders: [loader],
            as: '*.tsx',
          },
        }),
        conditions: {
          '#next-mdx': {
            path: extension,
          },
        },
        resolveAlias: Object.assign({}, nextConfig?.turbopack?.resolveAlias, {
          'next-mdx-import-source-file':
            '@vercel/turbopack-next/mdx-import-source',
        }),
      })
    }

    return nextConfig
  }
