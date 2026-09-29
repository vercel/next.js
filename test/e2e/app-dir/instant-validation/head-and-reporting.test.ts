import { runInstantValidationTests } from './harness.util'
import { registerHeadAndReportingTests } from './head-and-reporting.util'

runInstantValidationTests((ctx) => {
  registerHeadAndReportingTests(ctx)
})
