module.exports = {
  assetPrefix: 'https://example.vercel.sh/pre',
  // Intentionally omit `domains` and `remotePatterns`
  experimental: {
    images: {
      allowFutureImage: true,
    },
  },
}
