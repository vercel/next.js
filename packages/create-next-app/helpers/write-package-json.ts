import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Writes package.json object to disk
 */
export function writePackageJsonToDisk(root: string, value: any) {
  return fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(value, null, 2) + os.EOL
  )
}
