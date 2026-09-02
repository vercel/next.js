import { runInstantValidationTests } from './harness.util'
import { registerSlotsAndGroupsTests } from './slots-and-groups.util'

// These tests control the local compile and prerender lifecycle.
// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSlotsAndGroupsTests(ctx)
  })
})
