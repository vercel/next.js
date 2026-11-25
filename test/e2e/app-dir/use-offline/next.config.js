/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Keyed on test axis A (see scripts/run-jest.sh). Enabled by default —
    // a plain run exercises the hook with no special env — and disabled on
    // axis A, where the `@force-gate useOffline` on the suite skips the
    // fixture build entirely: `useOffline()` is a new API that is inert when
    // disabled (it always reports online), so the off state has nothing to
    // assert and would only fail by timing out. The keying turns a redundant
    // duplicate run into a near-free skip.
    useOffline: process.env.__NEXT_TEST_AXIS !== 'A',
    varyParams: true,
    optimisticRouting: true,
    cachedNavigations: true,
  },
}

module.exports = nextConfig
