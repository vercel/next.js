import { runBasicHmrTest } from './run-basic-hmr-test.util'

const nextConfig = { basePath: '/docs', assetPrefix: '/asset-prefix' }

describe(`HMR - basic, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runBasicHmrTest(nextConfig)
})
