import { runInstantValidationTests } from './harness.util'
import { registerClientTests } from './client.util'

runInstantValidationTests((ctx) => {
  registerClientTests(ctx)
})
