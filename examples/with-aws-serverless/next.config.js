const withImages = require('next-images')

module.exports = withImages({
  target: 'serverless',
  inlineImageLimit: 8 * 1024,
})
