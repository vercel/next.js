import { runCacheComponentsErrorsTests } from './shared.util'
import { registerSyncIoTimeAndRandomTests } from './sync-io-time-and-random.util'

// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests(registerSyncIoTimeAndRandomTests)
})
