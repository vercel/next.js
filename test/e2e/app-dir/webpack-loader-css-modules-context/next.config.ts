import type { NextConfig } from 'next'
import type { TurbopackLoaderItem } from 'next/dist/server/config-shared'

const localIdentName = process.env.CSS_MODULE_IDENT_NAME
const loaders: TurbopackLoaderItem[] = [
  {
    loader: 'style-loader',
    options: {
      insert: require.resolve('./insert-style.cjs'),
      attributes: { 'data-compat-style': 'custom' },
      styleTagTransform: require.resolve('./style-transform.cjs'),
    },
  },
  {
    loader: 'css-loader',
    options: { modules: localIdentName ? { localIdentName } : true },
  },
]

const nextConfig: NextConfig = {
  outputHashSalt: process.env.CSS_MODULE_HASH_SALT || undefined,
  turbopack: {
    rules: {
      '*.injectstyle': { loaders, as: '*.js' },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.injectstyle$/, use: loaders })
    return config
  },
}

export default nextConfig
