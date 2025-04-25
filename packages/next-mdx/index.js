module.exports =
  (pluginOptions = {}) =>
  (inputConfig = {}) => {
    const extension =
      pluginOptions.extension || (process.env.TURBOPACK ? 'mdx' : /\.mdx$/)
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
      if (
        !(
          Array.isArray(extension) &&
          extension.every((e) => typeof e === 'string')
        ) &&
        typeof extension !== 'string'
      ) {
        throw new Error(
          '@next/mdx: Turbopack only supports a single extension string or list of extensions. `extension` was',
          extension
        )
      }

      const extensions = (
        typeof extension === 'string' ? [extension] : extension
      )
        // Remove any leading dot from the extension as this is a common mistake.
        .map((ext) => ext.replace(/^\./, ''))

      const rules = nextConfig?.turbopack?.rules || {}
      for (const ext of extensions) {
        rules['*.' + ext] = {
          loaders: [loader],
          as: '*.tsx',
        }
      }

      nextConfig.turbopack = Object.assign({}, nextConfig?.turbopack, {
        rules,
        resolveAlias: Object.assign({}, nextConfig?.turbopack?.resolveAlias, {
          'next-mdx-import-source-file':
            '@vercel/turbopack-next/mdx-import-source',
        }),
      })
    }

    return nextConfig
  }
