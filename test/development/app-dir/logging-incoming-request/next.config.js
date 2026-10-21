/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async redirects() {
    return [
      { source: '/temporary-redirect', destination: '/foo', permanent: false },
      { source: '/permanent-redirect', destination: '/foo', permanent: true },
      {
        source: '/external-redirect',
        destination: 'https://example.com',
        permanent: false,
      },
      { source: '/hello-redirect', destination: '/foo', permanent: false },
    ]
  },
  logging: {
    incomingRequests: {
      ignore: [/^\/hello/, /^\/non-existent/, /^\/_next\/static\//],
    },
  },
}

module.exports = nextConfig
