import { runInstantValidationTests } from './harness.util'
import { registerSyncIoAndBlockingTests } from './sync-io-and-blocking.util'

// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSyncIoAndBlockingTests(ctx)
  })
})
