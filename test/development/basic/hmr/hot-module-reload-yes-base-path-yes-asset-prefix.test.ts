import { runHotModuleReloadHmrTest } from './run-hot-module-reload-hmr-test.util'

const nextConfig = { basePath: '/docs', assetPrefix: '/asset-prefix' }

describe(`HMR - Hot Module Reload, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runHotModuleReloadHmrTest(nextConfig)
})
