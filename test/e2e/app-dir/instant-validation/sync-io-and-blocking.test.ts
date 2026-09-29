import { runInstantValidationTests } from './harness.util'
import { registerSyncIoAndBlockingTests } from './sync-io-and-blocking.util'

runInstantValidationTests((ctx) => {
  registerSyncIoAndBlockingTests(ctx)
})
