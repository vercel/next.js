/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Enabled in the config rather than left to the test matrix, because the
  // sentinel this fixture reads its result from is cached, and `'use cache'`
  // does not compile without it. A route only reaches the state under test with
  // Cache Components anyway: without it a combination leaves no hole, so there
  // is no shell to resume and no prerender to keep.
  cacheComponents: true,
  experimental: {
    variants: true,
  },
}

module.exports = nextConfig
