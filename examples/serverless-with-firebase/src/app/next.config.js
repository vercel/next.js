const withTypescript = require('@zeit/next-typescript')

module.exports = withTypescript({
  target: "serverless",
  distDir: '../../dist/functions/next'
})
