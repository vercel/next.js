import { promises as fs } from 'fs'
import chalk from 'chalk'
import os from 'os'
import path from 'path'

import * as CommentJson from 'next/dist/compiled/comment-json'

export async function writeDefaultConfig(
  eslintrcFile: string | null,
  pkgJsonPath: string | null,
  packageJsonConfig: { eslintConfig: any } | null
) {
  const defaultConfig = {
    extends: 'next',
  }

  if (eslintrcFile) {
    const content = await fs.readFile(eslintrcFile, { encoding: 'utf8' }).then(
      (txt) => txt.trim().replace(/\n/g, ''),
      () => null
    )

    if (
      content === '' ||
      content === '{}' ||
      content === '---' ||
      content === 'module.exports = {}'
    ) {
      const ext = path.extname(eslintrcFile)

      let newFileContent
      if (ext === '.yaml' || ext === '.yml') {
        newFileContent = "extends: 'next'"
      } else {
        newFileContent = CommentJson.stringify(defaultConfig, null, 2)

        if (ext === '.js') {
          newFileContent = 'module.exports = ' + newFileContent
        }
      }

      await fs.writeFile(eslintrcFile, newFileContent + os.EOL)

      console.log(
        chalk.green(
          `We detected an empty ESLint configuration file (${chalk.bold(
            path.basename(eslintrcFile)
          )}) and updated it for you to include the base Next.js ESLint configuration.`
        )
      )
    }
  } else if (
    packageJsonConfig?.eslintConfig &&
    Object.entries(packageJsonConfig?.eslintConfig).length === 0
  ) {
    packageJsonConfig.eslintConfig = defaultConfig

    if (pkgJsonPath)
      await fs.writeFile(
        pkgJsonPath,
        CommentJson.stringify(packageJsonConfig, null, 2) + os.EOL
      )

    console.log(
      chalk.green(
        `We detected an empty ${chalk.bold(
          'eslintConfig'
        )} field in package.json and updated it for you to include the base Next.js ESLint configuration.`
      )
    )
  } else {
    await fs.writeFile(
      '.eslintrc',
      CommentJson.stringify(defaultConfig, null, 2) + os.EOL
    )

    console.log(
      chalk.green(
        `We created the ${chalk.bold(
          '.eslintrc'
        )} file for you and included the base Next.js ESLint configuration.`
      )
    )
  }
}
