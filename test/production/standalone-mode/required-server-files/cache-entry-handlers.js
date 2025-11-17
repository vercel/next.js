// @ts-check

/**
 * @param {import('http').ServerResponse} res
 * @returns {{
 *   onCacheEntry: import('next/dist/server/request-meta').OnCacheEntryHandler,
 *   onCacheEntryV2: import('next/dist/server/request-meta').OnCacheEntryHandler
 * }}
 */
module.exports = (res) => ({
  onCacheEntry: (cacheEntry, meta) => {
    // If this isn't a static app page response from the response cache, then
    // mark it as a miss.
    if (
      !cacheEntry.value ||
      cacheEntry.value.kind !== 'APP_PAGE' ||
      !cacheEntry.value.html ||
      typeof cacheEntry.value.html.toUnchunkedString !== 'function' ||
      !cacheEntry.value.postponed ||
      !meta.url ||
      typeof meta.url !== 'string'
    ) {
      res.setHeader('x-nextjs-cache-entry-handler', 'MISS_1')
      return false
    }

    // If this is for a RSC request, then mark it as a miss.
    if (meta.url.endsWith('.rsc')) {
      res.setHeader('x-nextjs-cache-entry-handler', 'MISS_1')
      return false
    }

    // Mark this as a hit against the cache entry handler.
    res.setHeader('x-nextjs-cache-entry-handler', 'HIT_1')
    return false
  },
  onCacheEntryV2: (cacheEntry, meta) => {
    // If this isn't a static app page response from the response cache, then
    // mark it as a miss.
    if (
      !cacheEntry.value ||
      cacheEntry.value.kind !== 'APP_PAGE' ||
      !cacheEntry.value.html ||
      typeof cacheEntry.value.html.toUnchunkedString !== 'function' ||
      !cacheEntry.value.postponed ||
      !meta.url ||
      typeof meta.url !== 'string'
    ) {
      res.setHeader('x-nextjs-cache-entry-handler', 'MISS_2')
      return false
    }

    // If this is for a prefetch or segment request, then mark it as a miss.
    if (
      meta.url.endsWith('.prefetch.rsc') ||
      meta.url.endsWith('.segment.rsc')
    ) {
      res.setHeader('x-nextjs-cache-entry-handler', 'MISS_2')
      return false
    }

    // Mark this as a hit against the cache entry handler.
    res.setHeader('x-nextjs-cache-entry-handler', 'HIT_2')
    return false
  },
})
