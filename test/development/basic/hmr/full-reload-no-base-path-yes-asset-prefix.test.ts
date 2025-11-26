import { runFullReloadHmrTest } from './run-full-reload-hmr-test.util'

const nextConfig = { basePath: '', assetPrefix: '/asset-prefix' }

describe(`HMR - Full Reload, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runFullReloadHmrTest(nextConfig)
})
