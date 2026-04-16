/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/rewrite-via-cookie',
          has: [{ type: 'cookie', key: 'isLoggedIn' }],
          destination: '/rewrite-via-cookie/authed',
        },
      ],
    }
  },
}
