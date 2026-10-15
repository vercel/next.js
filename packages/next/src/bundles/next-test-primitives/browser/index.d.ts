/* eslint-disable import/no-extraneous-dependencies -- Build inputs are development dependencies; only the generated declarations ship. */
export * from '@vitest/expect'
export * as spies from '@vitest/spy'
export { mockObject } from '@vitest/mocker'
export type { Mock, MockInstance, MaybeMockedDeep } from '@vitest/spy'
export {
  SnapshotClient,
  addSerializer,
  getSerializers,
  stripSnapshotIndentation,
  type SnapshotStateOptions,
  type SnapshotResult,
} from '@vitest/snapshot'

export { expectTypeOf } from 'expect-type'
export type { ExpectTypeOf } from 'expect-type'

export type { TestError } from '@vitest/utils'

export { format, inspect } from '@vitest/utils/display'
