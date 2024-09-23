/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'cache-control',
            value: 'max-age=1234',
          },
          {
            key: 'content-type',
            value: 'image/vnd.microsoft.icon',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
