import { runInstantValidationTests } from './harness.util'
import { registerHeadAndReportingTests } from './head-and-reporting.util'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !deploy
// @force-gate !futureCompat
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerHeadAndReportingTests(ctx)
  })
})
