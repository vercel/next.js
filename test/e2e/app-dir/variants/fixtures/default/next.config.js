/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    variants: true,
  },
}

// Set by `variants-base-path.test.ts`, which runs the whole suite a second time
// under a base path. The value arrives through `nextTestSetup`'s `env`, so that
// it reaches a local build and a deployed build alike.
if (process.env.BASE_PATH) {
  nextConfig.basePath = process.env.BASE_PATH
}

module.exports = nextConfig
