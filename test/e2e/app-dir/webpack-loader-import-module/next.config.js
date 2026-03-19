const path = require('path')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      'alias-data': './alias-data.mjs',
      'alias-dep': './esm-dep.mjs',
    },
    rules: {
      '*.test-file.ts': {
        loaders: [require.resolve('./test-file-loader.js')],
        as: '*.js',
      },
      '*.custom-data': {
        loaders: [require.resolve('./text-to-export-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'alias-data': path.resolve(__dirname, 'alias-data.mjs'),
      'alias-dep': path.resolve(__dirname, 'esm-dep.mjs'),
    }
    // Wrap externals handlers to prevent aliased bare specifiers from
    // being treated as external ESM packages by Next.js.
    const aliasedModules = new Set(['alias-data', 'alias-dep'])
    config.externals = config.externals.map((fn) => {
      if (typeof fn !== 'function') return fn
      return async function (ctx) {
        if (aliasedModules.has(ctx.request)) return
        return fn.apply(this, arguments)
      }
    })
    config.module.rules.push(
      {
        test: /\.test-file\.ts/,
        use: require.resolve('./test-file-loader.js'),
      },
      {
        test: /\.custom-data$/,
        use: require.resolve('./text-to-export-loader.js'),
      }
    )
    // Required so webpack can compile .wasm files referenced by
    // url-wasm-data.ts (used via importModule in the loader).
    // The actual wasm execution in importModule doesn't work in
    // webpack, but compilation needs to succeed.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    return config
  },
}

module.exports = nextConfig
