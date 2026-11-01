import { runInstantValidationTests } from './harness.util'
import { registerSuspenseBoundariesTests } from './suspense-boundaries.util'

// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSuspenseBoundariesTests(ctx)
  })
})
