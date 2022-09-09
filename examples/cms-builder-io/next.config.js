/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    domains: ['cdn.builder.io'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              'frame-ancestors https://*.builder.io https://builder.io http://localhost:1234',
          },
        ],
      },
    ]
  },
}
