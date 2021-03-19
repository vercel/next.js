import * as fs from 'fs'
import * as path from 'path'

export async function hasBabelConfiguration(baseDir: string) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(baseDir, 'package.json'), 'utf8')
  )

  return (
    fs.existsSync(path.join(baseDir, '.babelrc')) ||
    fs.existsSync(path.join(baseDir, '.babelrc.js')) ||
    fs.existsSync(path.join(baseDir, '.babelrc.json')) ||
    fs.existsSync(path.join(baseDir, 'babel.config.js')) ||
    fs.existsSync(path.join(baseDir, 'babel.config.json')) ||
    packageJson.babel != null
  )
}
