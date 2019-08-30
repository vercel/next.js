import fs from 'fs'
import path from 'path'

export default ({ query }, res) => {
  const { target } = query

  fs.writeFileSync(path.resolve(__dirname, `${target}.js`), target)

  res.end(target)
}
