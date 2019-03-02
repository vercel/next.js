const { DEPLOY } = process.env
const alias = 'with-zones.nextjs.org'

module.exports = {
  target: 'serverless',
  assetPrefix: DEPLOY ? `https://${alias}` : 'http://localhost:4000'
}
