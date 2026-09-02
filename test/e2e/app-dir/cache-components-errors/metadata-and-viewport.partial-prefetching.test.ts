import { runCacheComponentsErrorsTests } from './shared.util'
import { registerMetadataAndViewportTests } from './metadata-and-viewport.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

runCacheComponentsErrorsTests(registerMetadataAndViewportTests)
