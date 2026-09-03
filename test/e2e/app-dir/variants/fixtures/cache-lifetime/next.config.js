/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Enabled in the config rather than left to the test matrix, because the
  // route this fixture exists for selects a `cacheLife` per variant, and `'use
  // cache'` does not compile without it.
  cacheComponents: true,
  experimental: {
    variants: true,
  },
}

// Set by `variants-cache-lifetime-base-path.test.ts`, which runs the suite a
// second time under a base path. The value arrives through `nextTestSetup`'s
// `env`, so that it reaches a local build and a deployed build alike.
if (process.env.BASE_PATH) {
  nextConfig.basePath = process.env.BASE_PATH
}

module.exports = nextConfig
