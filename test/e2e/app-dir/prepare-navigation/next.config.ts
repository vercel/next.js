import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Keyed on test axis A (see scripts/run-jest.sh). Enabled by default — a
    // plain run exercises the API with no special env — and disabled on axis
    // A, where the `@force-gate prepareNavigation` on the suite skips the
    // fixture build entirely: `router.experimental_prepare()` is a new API
    // that doesn't exist when disabled, so the off state has nothing to
    // assert.
    prepareNavigation: process.env.__NEXT_TEST_AXIS !== 'A',
  },
}

export default nextConfig
