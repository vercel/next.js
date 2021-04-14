import chalk from 'chalk'
import { runLintCheck } from './eslint/runLintCheck'
import { CompileError } from './compile-error'
import { FatalError } from './fatal-error'

export async function verifyAndLint(
  dir: string,
  pagesDir: string
): Promise<void> {
  try {
    console.log('\n' + (await runLintCheck(dir, pagesDir)))
  } catch (err) {
    if (err instanceof CompileError) {
      console.error(chalk.red('Failed to compile.'))
      console.error(err.message)
      process.exit(1)
    } else if (err instanceof FatalError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
