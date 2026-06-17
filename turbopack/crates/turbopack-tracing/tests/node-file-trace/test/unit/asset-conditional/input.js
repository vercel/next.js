const path = require('path')
let moduleJsPath = path.join(
  __dirname,
  '.',
  isHarmony ? 'asset1.txt' : 'asset2.txt'
)
