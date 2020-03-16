const path = require('path')

module.exports = {
  experimental: {
    sassOptions: {
      includePaths: [path.join(__dirname, 'styles')],
    },
  },
}
