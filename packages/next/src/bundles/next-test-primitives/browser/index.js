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
