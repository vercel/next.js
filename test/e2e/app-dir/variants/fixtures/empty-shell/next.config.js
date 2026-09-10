/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // The route this fixture exists for reads a variant while prerendering, which
  // only happens with Cache Components. Enabled here rather than left to the
  // test matrix, so that the build fails for the reason under test in every
  // configuration.
  cacheComponents: true,
  experimental: {
    variants: true,
  },
}

module.exports = nextConfig
