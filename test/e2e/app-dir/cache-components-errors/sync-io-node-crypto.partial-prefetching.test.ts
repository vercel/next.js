import { runCacheComponentsErrorsTests } from './shared.util'
import { registerSyncIoNodeCryptoTests } from './sync-io-node-crypto.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests(registerSyncIoNodeCryptoTests)
})
