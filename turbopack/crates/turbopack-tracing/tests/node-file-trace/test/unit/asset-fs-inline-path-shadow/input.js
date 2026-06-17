const fs = require('fs')
const { join } = require('path')

console.log(fs.readFileSync(join(__dirname, 'asset.txt'), 'utf8'))
;(function () {
  var join = () => 'nope'
  console.log(fs.readFileSync(join(__dirname, 'asset.txt'), 'utf8'))
})()
