import { runFullReloadHmrTest } from './run-full-reload-hmr-test.util'

const nextConfig = { basePath: '/docs', assetPrefix: '/asset-prefix' }

describe(`HMR - Full Reload, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runFullReloadHmrTest(nextConfig)
})
