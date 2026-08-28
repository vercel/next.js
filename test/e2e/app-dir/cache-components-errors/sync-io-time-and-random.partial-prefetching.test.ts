import { runCacheComponentsErrorsTests } from './shared.util'
import { registerSyncIoTimeAndRandomTests } from './sync-io-time-and-random.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

runCacheComponentsErrorsTests(registerSyncIoTimeAndRandomTests)
