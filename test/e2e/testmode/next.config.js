/** @type {import('next').NextConfig} */
module.exports = {
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
