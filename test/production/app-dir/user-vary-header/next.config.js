/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Foo', value: 'bar' },
          { key: 'Vary', value: 'X-Foo' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
