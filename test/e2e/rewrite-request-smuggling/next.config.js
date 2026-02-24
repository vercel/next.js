/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/rewrites/:path*',
        destination: `http://127.0.0.1:${process.env.TEST_BACKEND_PORT}/rewrites/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
