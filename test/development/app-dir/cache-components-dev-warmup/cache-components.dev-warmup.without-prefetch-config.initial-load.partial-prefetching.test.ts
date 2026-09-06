import { runDevWarmupTests } from './dev-warmup.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

runDevWarmupTests({ hasRuntimePrefetch: false, isInitialLoad: true })
