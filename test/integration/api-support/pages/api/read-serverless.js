import fs from 'fs'
import path from 'path'

export default (req, res) => {
  const fileContent = fs.readFileSync(
    path.resolve(__dirname, '..', 'index.js'),
    'utf8'
  )

  res.end(fileContent)
}
