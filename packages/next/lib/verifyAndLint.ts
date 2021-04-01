import chalk from 'chalk'
import { Worker } from 'jest-worker'

export async function verifyAndLint(
  dir: string,
  pagesDir: string,
  numWorkers: number | undefined,
  enableWorkerThreads: boolean | undefined
): Promise<void> {
  try {
    const lintWorkers = new Worker(require.resolve('./eslint/runLintCheck'), {
      numWorkers,
      enableWorkerThreads,
    }) as Worker & {
      runLintCheck: typeof import('./eslint/runLintCheck').runLintCheck
    }

    lintWorkers.getStdout().pipe(process.stdout)
    lintWorkers.getStderr().pipe(process.stderr)

    console.log('\n' + (await lintWorkers.runLintCheck(dir, pagesDir, null)))
    lintWorkers.end()
  } catch (err) {
    if (err.type === 'ESLintCompileError') {
      console.error(chalk.red('Failed to compile.'))
      console.error(err.message)
      process.exit(1)
    } else if (err.type === 'ESLintFatalError') {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
