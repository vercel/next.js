/* eslint-disable import/no-extraneous-dependencies -- Build inputs are development dependencies; only the generated bundle ships. */
// One bundle keeps the matcher and spy registries shared without a Vitest runtime.
export * from '@vitest/expect'
export * as spies from '@vitest/spy'
export { mockObject } from '@vitest/mocker'
export {
  SnapshotClient,
  addSerializer,
  getSerializers,
  stripSnapshotIndentation,
} from '@vitest/snapshot'
export { NodeSnapshotEnvironment } from '@vitest/snapshot/environment'

export { expectTypeOf } from 'expect-type'

// Read-only original primitive identity; no caller can register an assertion.
import { getChaiAssertionIdentity as getChaiIdentity } from 'chai'
import { getVitestAssertionIdentity } from '@vitest/expect'
export function getChaiAssertionIdentity(value) {
  return getChaiIdentity(value) || getVitestAssertionIdentity(value)
}

// Pure literal upstream interfaces; origin is supplied only by Next construction.
export { createChaiAssertInterface, createChaiShouldInterface } from 'chai'

export { stringify } from '@vitest/utils/display'
