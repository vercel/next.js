import { runInstantValidationTests } from './harness.util'
import { registerSlotsAndGroupsTests } from './slots-and-groups.util'

runInstantValidationTests((ctx) => {
  registerSlotsAndGroupsTests(ctx)
})
