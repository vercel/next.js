module.exports = {
  rewrites() {
    return {
      fallback: [
        {
          source: '/:path*',
          destination: '/another',
        },
      ],
    }
  },
}
