const fs = require('fs')
const { sep } = require('path')

const X = sep

fs.readFileSync(__dirname + X + 'asset.txt')
