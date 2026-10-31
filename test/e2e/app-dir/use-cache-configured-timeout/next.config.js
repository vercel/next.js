/**
 * This configuration is NOT realistic — it's set up to exercise the clamp
 * logic in both dev and build. In practice, users might tune
 * `experimental.useCacheTimeout` up (e.g. for slower dev-time backends) or
 * down (e.g. for faster feedback while iterating); what's unusual here is
 * the very low `staticPageGenerationTimeout`.
 *
 * Setup:
 *   - `staticPageGenerationTimeout: 10` → build-time clamp = 9s, with a
 *     1s buffer before the build worker kills the page at 10s.
 *   - Dev `useCacheTimeout: 15` → would be clamped to 9s if we clamped in
 *     dev. We don't, so the raw 15s applies.
 *   - Build `useCacheTimeout: 60` → clamped to 9s.
 *   - `/below-dev-timeout` sleeps 11s (between 9s and 15s).
 *   - `/above-dev-timeout` sleeps 17s (above 15s).
 *
 * This way:
 *   - Dev `/below-dev-timeout` succeeds (proves no clamp; if we clamped, it
 *     would time out at 9s < 11s).
 *   - Dev `/above-dev-timeout` times out at 15s (proves the configured dev
 *     value is actually applied).
 *   - Build fails on both pages via the clamp (9s < 11s, 9s < 17s).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  staticPageGenerationTimeout: 10,
  experimental: {
    useCacheTimeout: process.env.__NEXT_DEV_SERVER ? 15 : 60,
    // Keep building all pages after a failure so the test can assert that
    // both pages timed out via the clamp.
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
