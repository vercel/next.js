const config = require('../next.config.js')
module.exports = {
  ...config,
  assetPrefix: '/foo/',
}
