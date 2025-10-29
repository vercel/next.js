const fs = require('fs')
console.log(fs.readFileSync(__dirname + '/asset.txt'))
console.log(fs.readFileSync(__dirname + '/sub/asset.txt'))
