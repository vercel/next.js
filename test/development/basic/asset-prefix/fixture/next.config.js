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
    }
  },
}
