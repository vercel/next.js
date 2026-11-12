// Portable testing primitives shared by all consumers in an execution realm.
export * from './expect'
export * as spies from './spy'
export { mockObject } from './mocker'
export type {
  Mock,
  MockInstance,
  MaybeMockedDeep,
  MockContext,
  MockResult,
  MockResultIncomplete,
  MockResultReturn,
  MockResultThrow,
  MockSettledResult,
  MockSettledResultFulfilled,
  MockSettledResultIncomplete,
  MockSettledResultRejected,
  Mocked,
  MockedClass,
  MockedFunction,
  MockedObject,
} from './spy'
export type { Disposable as MockDisposable } from './spy/optional-types'
export {
  SnapshotClient,
  addSerializer,
  getSerializers,
  stripSnapshotIndentation,
  type SnapshotStateOptions,
  type SnapshotResult,
  type SnapshotData,
  type SnapshotMatchOptions,
  type SnapshotSerializer,
  type SnapshotSummary,
  type SnapshotUpdateState,
  type UncheckedSnapshot,
} from './snapshot'
export { expectTypeOf, type ExpectTypeOf } from './typecheck'
export type { ParsedStack, SerializedError, TestError } from './utils/types'

export type BenchFn = () => unknown

import { getChaiAssertionIdentity as getChaiIdentity } from './chai'
import { getVitestAssertionIdentity } from './expect'

export function getChaiAssertionIdentity(value: unknown): object | undefined {
  return getChaiIdentity(value) || getVitestAssertionIdentity(value)
}

export {
  createChaiAssertInterface,
  createChaiShouldInterface,
  getChaiAssertionTransferSourceIdentity,
  hasChaiAssertionTaskFlagTransfer,
} from './chai'
export { stringify } from './utils/display'
