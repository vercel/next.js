import { promises as fs } from 'fs'
import chalk from 'chalk'
import os from 'os'
import path from 'path'

import * as CommentJson from 'next/dist/compiled/comment-json'

export async function writeDefaultConfig(
  eslintrcFile: string | null,
  pkgJsonPath: string | null
) {
  const defaultConfig = {
    extends: 'next',
  }

  if (eslintrcFile) {
    const ext = path.extname(eslintrcFile)

    let fileContent
    if (ext === '.yaml' || ext === '.yml') {
      fileContent = "extends: 'next'"
    } else {
      fileContent = CommentJson.stringify(defaultConfig, null, 2)

      if (ext === '.js') {
        fileContent = 'module.exports = ' + fileContent
      }
    }

    await fs.writeFile(eslintrcFile, fileContent + os.EOL)

    console.log(
      '\n' +
        chalk.green(
          `We detected ESLint in your project and updated the ${chalk.bold(
            path.basename(eslintrcFile)
          )} file for you.`
        ) +
        '\n'
    )
  } else if (pkgJsonPath) {
    const pkgJsonContent = await fs.readFile(pkgJsonPath, {
      encoding: 'utf8',
    })
    let packageJsonConfig = CommentJson.parse(pkgJsonContent)

    packageJsonConfig.eslintConfig = defaultConfig

    await fs.writeFile(
      pkgJsonPath,
      CommentJson.stringify(packageJsonConfig, null, 2) + os.EOL
    )

    console.log(
      '\n' +
        chalk.green(
          `We detected ESLint in your project and updated the ${chalk.bold(
            'eslintConfig'
          )} field for you in package.json...`
        ) +
        '\n'
    )
  }
}
