/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [new URL('https://example.com/**')],
  },
  experimental: {
    testProxy: true,
  },
  rewrites() {
    return [
      {
        source: '/rewrite-1',
        destination: 'https://example.com',
      },
    ]
  },
}
