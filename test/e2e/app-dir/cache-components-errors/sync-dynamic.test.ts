import { runCacheComponentsErrorsTests } from './shared.util'
import { registerDynamicRootAndBoundaryTests } from './dynamic-root-and-boundary.util'
import { registerSyncDynamicTests } from './sync-dynamic.util'

// Registers two section groups in one entry: dynamic-root-and-boundary is too
// small to justify its own CI test file (per-file server boot and, in start
// mode, build costs).
// These tests run local builds to inspect prerender error diagnostics.
// @force-gate !deploy
describe('Cache Components Errors', () => {
  runCacheComponentsErrorsTests((ctx) => {
    registerDynamicRootAndBoundaryTests(ctx)
    registerSyncDynamicTests(ctx)
  })
})
