const assetPrefix = process.env.BUILDING_FOR_VERCEL ? '/blog' : ''

module.exports = {
  assetPrefix,
  env: {
    ASSET_PREFIX: assetPrefix,
  },
}
