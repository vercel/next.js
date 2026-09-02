import { runInstantValidationTests } from './harness.util'
import { registerSuspenseBoundariesTests } from './suspense-boundaries.util'

// These tests control the local compile and prerender lifecycle.
// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSuspenseBoundariesTests(ctx)
  })
})
