const path = require('path')
module.exports = require(path.join(__dirname, '../../lib/with-react-17.js'))({
  experimental: {
    amp: {
      optimizer: {
        ampRuntimeVersion: '001515617716922',
        rtv: true,
        verbose: true,
      },
      skipValidation: true,
    },
  },
})
