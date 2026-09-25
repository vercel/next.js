const { readlinkSync } = require('fs')

if (readlinkSync(__dirname + '/linked.js') !== 'real.js') {
  throw new Error('relative symlink target was not preserved')
}

const { compute } = require('./linked')

console.log(compute())
