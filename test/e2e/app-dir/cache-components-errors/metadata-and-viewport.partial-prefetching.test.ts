import { runCacheComponentsErrorsTests } from './shared.util'
import { registerMetadataAndViewportTests } from './metadata-and-viewport.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests(registerMetadataAndViewportTests)
})
