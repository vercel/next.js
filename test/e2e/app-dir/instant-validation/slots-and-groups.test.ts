import { runInstantValidationTests } from './harness.util'
import { registerSlotsAndGroupsTests } from './slots-and-groups.util'

// @force-gate !deploy
describe('instant validation', () => {
  runInstantValidationTests((ctx) => {
    registerSlotsAndGroupsTests(ctx)
  })
})
