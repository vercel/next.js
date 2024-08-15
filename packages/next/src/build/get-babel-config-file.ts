import { join } from 'path'
import { existsSync } from 'fs'

const BABEL_CONFIG_FILES = [
  '.babelrc',
  '.babelrc.json',
  '.babelrc.js',
  '.babelrc.mjs',
  '.babelrc.cjs',
  'babel.config.js',
  'babel.config.json',
  'babel.config.mjs',
  'babel.config.cjs',
]

export function getBabelConfigFile(dir: string): string | undefined {
  for (const filename of BABEL_CONFIG_FILES) {
    const configFilePath = join(dir, filename)
    const exists = existsSync(configFilePath)
    if (!exists) {
      continue
    }
    return configFilePath
  }
}
