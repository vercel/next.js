import type { CacheControl } from '../cache-control'

/**
 * The map behind `SharedCacheControls`. This module is external so that all
 * runtime bundles share the same map.
 *
 * Everything that an external module imports is loaded from separate files,
 * also when the runtime bundles already contain it. So this module must only
 * hold the state, and the logic stays in `./shared-cache-controls`.
 */
export const sharedCacheControlsMap = new Map<string, CacheControl>()
