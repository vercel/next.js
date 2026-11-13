// @ts-check

/**
 * @typedef {{ cacheKey: string, tags: string[], stale: number, revalidate: number, expire: number }} CacheWrite
 */

/**
 * @type {typeof globalThis & { cacheWrites?: CacheWrite[] }}
 */
const reference = globalThis

module.exports = reference.cacheWrites ??= []
