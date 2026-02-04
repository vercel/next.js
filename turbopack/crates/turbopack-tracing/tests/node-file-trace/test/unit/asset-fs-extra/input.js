const fs = require('fs-extra')

console.log(fs.readFileSync(`${process.cwd()}/asset1.txt`))
console.log(fs.readJsonSync(process.cwd() + '/asset2.json'))
