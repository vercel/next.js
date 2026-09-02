import { runCacheComponentsErrorsTests } from './shared.util'
import { registerUseCacheTests } from './use-cache.util'
import { registerUseCachePrivateTests } from './use-cache-private.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

// Registers two section groups in one entry: use-cache-private is too small
// to justify its own CI test file (per-file server boot and, in start mode,
// build costs).
runCacheComponentsErrorsTests((ctx) => {
  registerUseCacheTests(ctx)
  registerUseCachePrivateTests(ctx)
})
