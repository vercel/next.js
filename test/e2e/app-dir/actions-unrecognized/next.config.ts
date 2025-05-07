import type { NextConfig } from 'next'

if (process.env.ENABLE_ERROR_ON_UNRECOGNIZED_ACTION === undefined) {
  throw new Error(
    'process.env.ENABLE_ERROR_ON_UNRECOGNIZED_ACTION must be set to either "true" or "false"\n' +
      '(next.config.js will set `serverActions.errorOnUnrecognized` to that value)'
  )
}

const errorOnUnrecognized = JSON.parse(
  process.env.ENABLE_ERROR_ON_UNRECOGNIZED_ACTION
)

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    serverSourceMaps: true,
    serverActions: {
      errorOnUnrecognized,
    },
  },
}

export default nextConfig
