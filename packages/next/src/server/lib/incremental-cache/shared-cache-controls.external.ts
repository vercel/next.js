/**
 * Next.js does not import this module. The runtimes bundle the class from
 * `./shared-cache-controls` and share only its map, which lives in
 * `./shared-cache-controls-map.external`.
 *
 * This path stays because cache handlers outside of Next.js import
 * `SharedCacheControls` from it to record the lifetime of an entry. A cache
 * handler can return `cacheControl` from `get()` instead, see
 * `CacheHandlerValue`. Remove this file when they no longer import it.
 */
export { SharedCacheControls } from './shared-cache-controls'
