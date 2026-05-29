import fs from 'fs'
import { join } from 'path'

console.log(fs.readFileSync(join(__dirname, 'asset.txt'), 'utf8'))
