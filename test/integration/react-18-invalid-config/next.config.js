const path = require('path')
const withReactChannel =
  'exp' === '18'
    ? (v, conf) => conf
    : require(path.join(__dirname, '../../lib/with-react-channel.js'))
module.exports = withReactChannel('exp', {
  experimental: { serverComponents: true },
})
