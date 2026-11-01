import { runInstantValidationTests } from './harness.util'
import { registerSyncIoAndBlockingTests } from './sync-io-and-blocking.util'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !deploy
// @force-gate !futureCompat
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSyncIoAndBlockingTests(ctx)
  })
})
