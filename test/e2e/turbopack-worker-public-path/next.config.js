/**
 * Simulates a cross-origin CDN by prefixing assets with '/cdn-prefix' and
 * rewriting them back to the real static path. With
 * `experimental.turbopackWorkerPublicPath` set, Worker URLs should NOT receive
 * the CDN prefix (they should stay same-origin).
 */
module.exports = {
  assetPrefix: '/cdn-prefix',
  experimental: {
    turbopackWorkerPublicPath: '/_next/',
  },
  async rewrites() {
    return {
      afterFiles: [
        {
          source: '/cdn-prefix/:path*',
          destination: '/:path*',
        },
      ],
    }
  },
}
