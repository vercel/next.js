const fs = require('fs')

fs.readFile('./asset1.txt')

fs.readFile(require.resolve('./asset2.txt'))

const _basePath = __dirname
const asset3 = 'asset3.txt'
fs.readFileSync(_basePath + '/' + asset3, 'utf8')
