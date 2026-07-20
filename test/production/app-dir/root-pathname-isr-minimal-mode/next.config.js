/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // This fixture exercises legacy ISR through `revalidate`. CI also runs it
  // with Cache Components and Cached Navigations enabled through environment
  // variables, so explicitly keep both incompatible features disabled.
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
  // Root-path normalization must distinguish the platform's internal `/index`
  // alias from a real user rewrite whose public source remains `/index`. Gate
  // this rewrite by a header so the primary ISR reproduction is unchanged.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/index',
          has: [
            {
              type: 'header',
              key: 'x-test-index-rewrite',
              value: '1',
            },
          ],
          destination: '/',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

module.exports = nextConfig
