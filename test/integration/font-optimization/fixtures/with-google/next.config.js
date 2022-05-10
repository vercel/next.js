const path = require('path')
module.exports = require(path.join(
  __dirname,
  '../../../../lib/with-react-17.js'
))({
  cleanDistDir: false,
})
