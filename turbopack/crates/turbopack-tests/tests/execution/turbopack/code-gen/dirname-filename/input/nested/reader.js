const fs = require('fs')
const path = require('path')

exports.read = () =>
  fs.readFileSync(path.join(__dirname, 'data.txt'), 'utf8').trim()
