/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    skipTrailingSlashRedirect: true,
    skipMiddlewareUrlNormalize: true,
    allowMiddlewareResponseBody: true,
  },
  async redirects() {
    return [
      {
        source: '/redirect-me',
        destination: '/another',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/another',
      },
    ]
  },
}

module.exports = nextConfig
