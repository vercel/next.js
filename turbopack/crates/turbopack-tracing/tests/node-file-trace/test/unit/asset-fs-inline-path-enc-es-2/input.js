import fs from 'fs'
import path from 'path'

console.log(fs.readFileSync(path.join(__dirname, 'asset.txt'), 'utf8'))
