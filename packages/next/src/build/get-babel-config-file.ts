import { fileExists } from '../lib/file-exists'
import { join } from 'path'

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

export async function getBabelConfigFile(
  dir: string
): Promise<string | undefined> {
  for (const filename of BABEL_CONFIG_FILES) {
    const configFilePath = join(dir, filename)
    const exists = await fileExists(configFilePath)
    if (!exists) {
      continue
    }
    return configFilePath
  }
}
