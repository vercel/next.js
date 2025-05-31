import { runErrorRecoveryHmrTest } from './run-error-recovery-hmr-test.util'

const nextConfig = { basePath: '/docs', assetPrefix: '' }

describe(`HMR - Error Recovery, nextConfig: ${JSON.stringify(nextConfig)}`, () => {
  runErrorRecoveryHmrTest(nextConfig)
})
