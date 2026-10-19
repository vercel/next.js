/* eslint-disable import/no-extraneous-dependencies -- Build inputs are development dependencies; only the generated declarations ship. */
export * from '@vitest/expect'
export * as spies from '@vitest/spy'
export { mockObject } from '@vitest/mocker'
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
} from '@vitest/spy'
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

export { queries, prettyDOM } from '@testing-library/dom'
import domMatchers = require('@testing-library/jest-dom/matchers')
export { domMatchers }

/** Private lookup for assertions created by the genuine pinned primitives. */
export declare function getChaiAssertionIdentity(
  value: unknown
): object | undefined

/** Private pure upstream helper factories; these do not register origins. */
export declare function createChaiAssertInterface(
  assertion: typeof import('@vitest/expect').chai.Assertion,
  flag: typeof import('@vitest/expect').chai.util.flag
): typeof import('@vitest/expect').chai.assert
export declare function createChaiShouldInterface(
  assertion: typeof import('@vitest/expect').chai.Assertion
): typeof import('@vitest/expect').chai.should

export { stringify } from '@vitest/utils/display'

export type { Disposable as MockDisposable } from '@vitest/spy/optional-types.js'

export declare function createTimerContext(
  global: typeof globalThis
): import('../timers').TimerContext
