import { runInstantValidationTests } from './harness.util'
import { registerClientTests } from './client.util'

// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerClientTests(ctx)
  })
})
