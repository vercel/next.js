import { runInstantValidationTests } from './harness.util'
import { registerHeadAndReportingTests } from './head-and-reporting.util'

// These tests control the local compile and prerender lifecycle.
// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerHeadAndReportingTests(ctx)
  })
})
