const assetPrefix = process.env.BUILDING_FOR_NOW ? '/blog' : ''

module.exports = {
  assetPrefix,
  env: {
    ASSET_PREFIX: assetPrefix,
  },
}
