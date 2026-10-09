/* eslint-disable import/no-extraneous-dependencies -- Build inputs are development dependencies; only the generated bundle ships. */
// One bundle keeps the matcher and spy registries shared without a Vitest runtime.
export * from '@vitest/expect'
export * as spies from '@vitest/spy'
export { SnapshotClient, addSerializer, getSerializers } from '@vitest/snapshot'
export { NodeSnapshotEnvironment } from '@vitest/snapshot/environment'
