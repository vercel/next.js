/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'cookie', key: 'isLoggedIn' }],
          destination: '/authed',
        },
      ],
    }
  },
}

module.exports = nextConfig
