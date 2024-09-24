/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
    headers() {
      return [
        {
          source: '/app-ssr',
          headers: [
            {
              key: 'Cache-Control',
              value: 's-maxage=32',
            },
          ],
        }
      ]
    },
  }
  
  module.exports = nextConfig