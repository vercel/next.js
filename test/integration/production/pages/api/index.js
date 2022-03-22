import fs from 'fs'
import path from 'path'
import data from '../../static/hello.json'

export default (req, res) => {
  console.log({
    importedData: data,
    fsLoadedData: fs.readFileSync(
      path.join(process.cwd(), 'static', 'hello.json'),
      'utf8'
    ),
  })
  res.end('API index works')
}
