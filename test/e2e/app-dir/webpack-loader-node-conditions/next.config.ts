import type { NextConfig } from 'next'

const loaders = [
  'condition-loader/sync',
  'condition-loader/sync-only',
  'condition-loader/addons',
  'condition-loader/addons-only',
]

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.condition-test': { loaders, as: '*.js' },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.condition-test$/,
      use: loaders,
    })
    config.resolveLoader.conditionNames = [
      'module-sync',
      'node-addons',
      'require',
      'node',
    ]
    return config
  },
}

export default nextConfig
