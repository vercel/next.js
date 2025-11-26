import { runFullReloadHmrTest } from './run-full-reload-hmr-test.util'

const nextConfig = { basePath: '', assetPrefix: '' }

describe(`HMR - Full Reload, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runFullReloadHmrTest(nextConfig)
})
