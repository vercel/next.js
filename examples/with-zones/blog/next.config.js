module.exports = {
  target: 'serverless',
  assetPrefix: process.env.BUILDING_FOR_NOW ? '/blog' : ''
}
