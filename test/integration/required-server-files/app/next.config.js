module.exports = {
  // ensure incorrect target is overridden by env
  target: 'serverless',
  experimental: {
    nftTracing: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  rewrites() {
    return [
      {
        source: '/some-catch-all/:path*',
        destination: '/',
      },
    ]
  },
}
