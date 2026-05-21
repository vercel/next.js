/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: false,
  experimental: {
    prefetchInlining: true,
    // Defensively pin `cachedNavigations: false`: this fixture sets
    // `cacheComponents: false`, but CI jobs that set
    // `__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS=true` would otherwise
    // auto-enable `cachedNavigations`, tripping the validation that
    // requires `cacheComponents`. Can be removed once the env-var
    // auto-enable is dropped (TODO in config.ts).
    cachedNavigations: false,
  },
}

module.exports = nextConfig
