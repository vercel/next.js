const ASSET_PREFIX = 'custom-asset-prefix'

module.exports = {
  assetPrefix: ASSET_PREFIX,
  i18n: {
    locales: ['en-US'],
    defaultLocale: 'en-US',
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: `/:locale/${ASSET_PREFIX}/_next/:path*`,
          destination: `/${ASSET_PREFIX}/_next/:path*`,
          locale: false,
        },
      ],
      afterFiles: [
        {
          source: `/${ASSET_PREFIX}/:path*`,
          destination: '/:path*',
        },
        {
          source: '/not-custom-asset-prefix/:path*',
          destination: '/:path*',
        },
      ],
    }
  },
}
