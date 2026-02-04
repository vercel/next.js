const fs = require('graceful-fs')

console.log(fs.readFileSync(`${process.cwd()}/asset.txt`))
console.log(fs.readFileSync(process.cwd() + '/sub/asset.txt'))
