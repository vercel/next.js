import { runInstantValidationTests } from './harness.util'
import { registerSuspenseBoundariesTests } from './suspense-boundaries.util'

runInstantValidationTests((ctx) => {
  registerSuspenseBoundariesTests(ctx)
})
