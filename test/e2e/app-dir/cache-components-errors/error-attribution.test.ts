import { runCacheComponentsErrorsTests } from './shared.util'
import { registerErrorAttributionTests } from './error-attribution.util'

// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests(registerErrorAttributionTests)
})
