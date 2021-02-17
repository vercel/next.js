import chalk from 'chalk'
import { runEslint } from './eslint/runEslint'

export async function verifyEslintSetup(
  dir: string,
  pagesDir: string,
  errorsEnabled: boolean
) {
  try {
    return await runEslint(dir, pagesDir, errorsEnabled)
  } catch (err) {
    console.error(chalk.red('Failed to compile.'))
    console.error(err.message)
    process.exit(1)
  }
}
