import fs from 'fs'
import path from 'path'
import css from '../../components/logo/logo.module.css'

export default (req, res) => {
  console.log({
    importedData: css,
    fsLoadedData: fs.readFileSync(
      path.join(process.cwd(), 'components', 'logo', 'logo.module.css'),
      'utf8'
    ),
  })
  res.end('API index works')
}
