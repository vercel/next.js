/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Set high enough to cover the second probe in the "stuck after some
    // chunks" recovery test, where the rescheduled probe completes around
    // ~t=32s and must be allowed to fire before the outer timeout.
    // Existing dev-deadlock cases fire at probe completion (~t=22s) and
    // are unaffected; only `also-hangs` relies on the outer timeout, and
    // taking 40s instead of 25s is acceptable in dev tests.
    useCacheTimeout: 40,
  },
}

module.exports = nextConfig
