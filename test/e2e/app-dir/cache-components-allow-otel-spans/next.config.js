/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // This suite observes the background upgrade of a fallback shell into a
  // concrete ISR entry (the first request's spans differ from the upgraded
  // second request's). That upgrade only runs when Partial Prefetching is
  // enabled, so opt in to keep exercising it.
  partialPrefetching: true,
}

module.exports = nextConfig
