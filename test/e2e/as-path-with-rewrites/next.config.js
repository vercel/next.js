/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/:path+',
        missing: [
          {
            type: 'host',
            value: 'example.com',
          },
        ],
        destination: '/rewrite-target',
      },
    ]
  },
}

module.exports = nextConfig
