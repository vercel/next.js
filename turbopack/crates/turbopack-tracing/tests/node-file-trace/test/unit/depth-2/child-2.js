const fs = require('fs')
const { join } = require('path')

require('./child-1')
require('./child-3')

fs.readFileSync(join(__dirname, 'asset.txt'))
fs.readFileSync(join(__dirname, 'asset-2.txt'))
