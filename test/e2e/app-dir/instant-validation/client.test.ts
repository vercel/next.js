import { runInstantValidationTests } from './harness.util'
import { registerClientTests } from './client.util'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !deploy
// @force-gate !futureCompat
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerClientTests(ctx)
  })
})
