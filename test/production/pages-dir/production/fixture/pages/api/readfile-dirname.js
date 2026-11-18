import { readFileSync } from 'fs'
import { join } from 'path'

// With webpack, __dirname is going to be different after build since the file
// is located in .next/server/pages/api instead of the src location
// so this is not expected to work. Turbopack resolves __dirname to the source
// location at runtime, where the traced asset exists.
const file = join(__dirname, '../../static/data/item.txt')
const content = readFileSync(file, 'utf8')
console.log({ file, content })

export default (req, res) => {
  res.end(content)
}
