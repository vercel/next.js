const assetPrefix = process.env.BUILDING_FOR_NOW ? '/blog' : ''

module.exports = {
  target: 'serverless',
  assetPrefix,
  env: {
    ASSET_PREFIX: assetPrefix
  }
}
