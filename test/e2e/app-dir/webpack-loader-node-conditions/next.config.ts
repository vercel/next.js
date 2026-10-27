import type { NextConfig } from 'next'

const loaders = [
  './module-loader.js',
  'condition-loader/sync',
  ...(process.features.require_module ? ['condition-loader/sync-only'] : []),
  'condition-loader/addons',
  'condition-loader/addons-only',
]

const nextConfig: NextConfig = {
  env: {
    SELECTED_LOADER_VALUE: require('condition-loader/sync')(
      require('condition-loader/addons')('input')
    ),
  },
  turbopack: {
    rules: {
      '*.condition-test': { loaders, as: '*.js' },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.condition-test$/,
      use: loaders.map((loader) => require.resolve(loader)),
    })
    return config
  },
}

export default nextConfig
