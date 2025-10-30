import { createDefaultCacheHandler } from './default'

/**
 * Used for edge runtime compatibility.
 *
 * @deprecated Use createDefaultCacheHandler instead.
 */
export default createDefaultCacheHandler(50 * 1024 * 1024)
