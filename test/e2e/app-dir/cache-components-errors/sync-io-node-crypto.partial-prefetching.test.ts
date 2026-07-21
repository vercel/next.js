import { runCacheComponentsErrorsTests } from './shared.util'
import { registerSyncIoNodeCryptoTests } from './sync-io-node-crypto.util'

process.env.__NEXT_PARTIAL_PREFETCHING = 'true'

runCacheComponentsErrorsTests(registerSyncIoNodeCryptoTests)
