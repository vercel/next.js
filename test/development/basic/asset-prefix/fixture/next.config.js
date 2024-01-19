const ASSET_PREFIX = 'asset-prefix'

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
          destination: '/_next/:path*',
          locale: false,
        },
      ],
    }
  },
}
