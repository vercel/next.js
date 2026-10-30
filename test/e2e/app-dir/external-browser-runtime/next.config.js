const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

/**
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
module.exports = (phase) => ({
  crossOrigin: 'use-credentials',
  experimental: {
    externalBrowserRuntime: true,
  },
  async headers() {
    if (phase === PHASE_DEVELOPMENT_SERVER) {
      return []
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "script-src 'self'",
          },
        ],
      },
    ]
  },
})
