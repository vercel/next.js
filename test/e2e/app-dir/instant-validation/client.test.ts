import { runInstantValidationTests } from './harness.util'
import { registerClientTests } from './client.util'

// These tests control the local compile and prerender lifecycle.
// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerClientTests(ctx)
  })
})
