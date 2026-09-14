import { runCacheComponentsErrorsTests } from './shared.util'
import { registerErrorAttributionTests } from './error-attribution.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

runCacheComponentsErrorsTests(registerErrorAttributionTests)
