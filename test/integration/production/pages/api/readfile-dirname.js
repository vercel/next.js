import { readFileSync } from 'fs'
import { join } from 'path'
const file = join(__dirname, '../../static/data/item.txt')
const content = readFileSync(file, 'utf8')
console.log({ file, content })

export default (req, res) => {
  res.end(content)
}
