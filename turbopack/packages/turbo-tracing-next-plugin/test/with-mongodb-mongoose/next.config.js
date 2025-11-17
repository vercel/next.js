const { join } = require('path')

const { createNodeFileTrace } = require('../..')

module.exports = createNodeFileTrace({
  path: join(__dirname, '..', '..', '..', '..', 'target', 'debug'),
})({
  reactStrictMode: true,
})
