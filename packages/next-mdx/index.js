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
    const nextConfig = {
      ...inputConfig,
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
    }

    if (process.env.TURBOPACK) {
      const mdxRule = {
        loaders: [loader],
        as: '*.tsx',
        condition: {
          path: extension,
        },
      }

      // Use a unique glob string for two reasons:
      // - This makes it clear where the rule was defined if someone needs to debug.
      // - Reduces the chance of a collision (can still happen if `next-mdx` is applied twice with
      //   different options). Rule evaluation is ordering-sensitive, and a unique glob means we're
      //   less likely to break the ordering of existing rules.
      let wildcardGlob = '{*,next-mdx-rule}'
      let wildcardRule = inputConfig.turbopack?.rules?.[wildcardGlob] ?? []
      wildcardRule = [
        ...(Array.isArray(wildcardRule) ? wildcardRule : [wildcardRule]),
        mdxRule,
      ]

      nextConfig.turbopack = {
        ...inputConfig?.turbopack,
        rules: {
          ...inputConfig?.turbopack?.rules,
          [wildcardGlob]: wildcardRule,
        },
        resolveAlias: {
          ...inputConfig?.turbopack?.resolveAlias,
          'next-mdx-import-source-file':
            '@vercel/turbopack-next/mdx-import-source',
        },
      }
    }

    return nextConfig
  }
