const fs = require('fs')
const { join } = require('path')

require('./child-2')

fs.readFileSync(join(__dirname, 'asset.txt'))
