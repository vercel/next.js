import { runBasicHmrTest } from './run-basic-hmr-test.util'

const nextConfig = { basePath: '', assetPrefix: '/asset-prefix' }

describe(`HMR - basic, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runBasicHmrTest(nextConfig)
})
