/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // These tests assert on per-link/runtime prefetch responses to verify
    // varyParams cache-key behavior. App Shells skips the per-link Speculative
    // prefetch for non-eager routes (deferring param-dependent content to
    // navigation), which makes that behavior unobservable via prefetch. Keep
    // App Shells off here so the varyParams feature is exercised in isolation.
    appShells: false,
    optimisticRouting: true,
    prefetchInlining: false,
    varyParams: true,
  },
}

module.exports = nextConfig
