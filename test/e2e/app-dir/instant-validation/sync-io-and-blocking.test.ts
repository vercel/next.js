import { runInstantValidationTests } from './harness.util'
import { registerSyncIoAndBlockingTests } from './sync-io-and-blocking.util'

// These tests control the local compile and prerender lifecycle.
// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSyncIoAndBlockingTests(ctx)
  })
})
