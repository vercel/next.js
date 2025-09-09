import { runErrorRecoveryHmrTest } from './run-error-recovery-hmr-test.util'

const nextConfig = { basePath: '', assetPrefix: '/asset-prefix' }

describe(`HMR - Error Recovery, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runErrorRecoveryHmrTest(nextConfig)
})
