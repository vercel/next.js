import * as fs from 'fs'
import * as path from 'path'

export async function hasBabelConfiguration(dir: string) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  )

  return (
    fs.existsSync(path.join(dir, '.babelrc')) ||
    fs.existsSync(path.join(dir, '.babelrc.js')) ||
    fs.existsSync(path.join(dir, '.babelrc.json')) ||
    fs.existsSync(path.join(dir, 'babel.config.js')) ||
    fs.existsSync(path.join(dir, 'babel.config.json')) ||
    packageJson.babel != null
  )
}
