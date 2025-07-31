/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: '/foo',
        },
        {
          source: '/rewrite-to-another-segment/:id',
          destination: '/rewrite-to-another-segment/:id/foo',
        },
        {
          source: '/rewrite-to-same-segment/1',
          destination: '/rewrite-to-same-segment/001',
        },
        {
          source: '/rewrite-to-same-segment/2',
          destination: '/rewrite-to-same-segment/002',
        },
        {
          source: '/rewrite-to-same-segment/3',
          destination: '/rewrite-to-same-segment/003',
        },
      ],
    }
  },
}

module.exports = nextConfig
