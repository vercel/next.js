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

export { expectTypeOf } from 'expect-type'

export { format, inspect } from '@vitest/utils/display'

export { queries, prettyDOM } from '@testing-library/dom'
import * as matcherExports from '@testing-library/jest-dom/matchers'
export const domMatchers = Object.fromEntries(
  Object.entries(matcherExports).filter(
    ([name, matcher]) => name !== 'default' && typeof matcher === 'function'
  )
)

// Read-only original primitive identity; no caller can register an assertion.
import { getChaiAssertionIdentity as getChaiIdentity } from 'chai'
import { getVitestAssertionIdentity } from '@vitest/expect'
export function getChaiAssertionIdentity(value) {
  return getChaiIdentity(value) || getVitestAssertionIdentity(value)
}

// Pure literal upstream interfaces; origin is supplied only by Next construction.
export { createChaiAssertInterface, createChaiShouldInterface } from 'chai'

export { stringify } from '@vitest/utils/display'

// The browser clock uses the same pinned Sinon implementation without Node IO.
import { withGlobal } from '@sinonjs/fake-timers'
export function createTimerContext(global) {
  return withGlobal(global)
}
