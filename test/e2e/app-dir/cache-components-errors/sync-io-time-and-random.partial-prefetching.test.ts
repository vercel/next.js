import { runCacheComponentsErrorsTests } from './shared.util'
import { registerSyncIoTimeAndRandomTests } from './sync-io-time-and-random.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests(registerSyncIoTimeAndRandomTests)
})
