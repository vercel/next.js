import chalk from 'chalk'
import { runEslint } from './eslint/runEslint'

export async function verifyEslintSetup(
  dir: string,
  pagesDir: string,
  pagePath: string | null
) {
  try {
    return await runEslint(dir, pagesDir, pagePath)
  } catch (err) {
    console.error(chalk.red('Failed to compile.'))
    console.error(err.message)
    process.exit(1)
  }
}
