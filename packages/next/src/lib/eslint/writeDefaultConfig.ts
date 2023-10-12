import { promises as fs } from 'fs'
import { bold, green } from '../picocolors'
import os from 'os'
import path from 'path'
import * as CommentJson from 'next/dist/compiled/comment-json'
import type { ConfigAvailable } from './hasEslintConfiguration'

import * as Log from '../../build/output/log'

export async function writeDefaultConfig(
  baseDir: string,
  { exists, emptyEslintrc, emptyPkgJsonConfig }: ConfigAvailable,
  selectedConfig: any,
  eslintrcFile: string | null,
  pkgJsonPath: string | null,
  packageJsonConfig: { eslintConfig: any } | null
) {
  if (!exists && emptyEslintrc && eslintrcFile) {
    const ext = path.extname(eslintrcFile)

    let newFileContent
    if (ext === '.yaml' || ext === '.yml') {
      newFileContent = "extends: 'next'"
    } else {
      newFileContent = CommentJson.stringify(selectedConfig, null, 2)

      if (ext === '.js') {
        newFileContent = 'module.exports = ' + newFileContent
      }
    }

    await fs.writeFile(eslintrcFile, newFileContent + os.EOL)

    Log.info(
      `We detected an empty ESLint configuration file (${bold(
        path.basename(eslintrcFile)
      )}) and updated it for you!`
    )
  } else if (!exists && emptyPkgJsonConfig && packageJsonConfig) {
    packageJsonConfig.eslintConfig = selectedConfig

    if (pkgJsonPath)
      await fs.writeFile(
        pkgJsonPath,
        CommentJson.stringify(packageJsonConfig, null, 2) + os.EOL
      )

    Log.info(
      `We detected an empty ${bold(
        'eslintConfig'
      )} field in package.json and updated it for you!`
    )
  } else if (!exists) {
    await fs.writeFile(
      path.join(baseDir, '.eslintrc.json'),
      CommentJson.stringify(selectedConfig, null, 2) + os.EOL
    )

    console.log(
      green(
        `We created the ${bold(
          '.eslintrc.json'
        )} file for you and included your selected configuration.`
      )
    )
  }
}
