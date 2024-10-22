import { promises as fs } from 'fs'
import { bold } from '../picocolors'
import os from 'os'
import path from 'path'
import * as CommentJson from 'next/dist/compiled/comment-json'
import type { ConfigAvailable } from './hasEslintConfiguration'

import { info } from '../../build/output/log'

export async function writeDefaultConfig(
  baseDir: string,
  { exists, emptyEslintrc }: ConfigAvailable,
  selectedConfig: any,
  eslintrcFile: string | null
) {
  if (!exists) {
    const isLegacyConfig = eslintrcFile && eslintrcFile.startsWith('.eslintrc')

    if (emptyEslintrc && isLegacyConfig) {
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

      info(
        `We detected an empty ESLint configuration file (${bold(
          path.basename(eslintrcFile)
        )}) and updated it for you!`
      )
      return
    }

    await fs.writeFile(
      path.join(baseDir, 'eslint.config.mjs'),
      selectedConfig + os.EOL
    )

    info(
      `We created the ${bold(
        'eslint.config.mjs'
      )} file for you and included your selected configuration.`
    )
  }
}
