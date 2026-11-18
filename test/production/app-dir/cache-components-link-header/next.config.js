/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    short: { stale: 300, revalidate: 1, expire: 3600 },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Link', value: '</llms.txt>; rel="llms-txt"' }],
      },
    ]
  },
}

module.exports = nextConfig
