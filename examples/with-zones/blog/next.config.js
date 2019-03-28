const { DEPLOY } = process.env
const alias = 'with-zones-blog.nextjs.org'

module.exports = {
  target: 'serverless',
  assetPrefix: DEPLOY ? `https://${alias}` : 'http://localhost:5000'
}
