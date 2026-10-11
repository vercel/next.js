/* eslint-disable import/no-extraneous-dependencies -- Build inputs are development dependencies; only the generated declarations ship. */
export * from '@vitest/expect'
export * as spies from '@vitest/spy'
export type { Mock, MockInstance } from '@vitest/spy'
export {
  SnapshotClient,
  type SnapshotStateOptions,
  type SnapshotResult,
} from '@vitest/snapshot'
export { NodeSnapshotEnvironment } from '@vitest/snapshot/environment'
