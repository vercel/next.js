import { runInstantValidationTests } from './harness.util'
import { registerHeadAndReportingTests } from './head-and-reporting.util'

// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerHeadAndReportingTests(ctx)
  })
})
