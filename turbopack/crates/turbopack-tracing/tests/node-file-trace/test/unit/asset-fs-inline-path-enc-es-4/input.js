import fs from 'fs'
import * as path from 'path'

const join = path.join

console.log(fs.readFileSync(join(__dirname, 'asset.txt'), 'utf8'))
