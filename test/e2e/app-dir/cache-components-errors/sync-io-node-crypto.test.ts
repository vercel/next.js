import { runCacheComponentsErrorsTests } from './shared.util'
import { registerSyncIoNodeCryptoTests } from './sync-io-node-crypto.util'

// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests(registerSyncIoNodeCryptoTests)
})
