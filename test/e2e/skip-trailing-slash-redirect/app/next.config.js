/** @type {import('next').NextConfig} */
const nextConfig = {
  allowMiddlewareResponseBody: true,
  skipMiddlewareUrlNormalize: true,
  experimental: {
    skipTrailingSlashRedirect: true,
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
