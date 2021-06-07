import chalk from 'chalk'
import { Worker } from 'jest-worker'

export async function verifyAndLint(
  dir: string,
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

    const lintResults = await lintWorkers.runLintCheck(dir, null, true)
    if (lintResults) {
      console.log(lintResults)
    }

    lintWorkers.end()
  } catch (err) {
    if (err.type === 'CompileError') {
      console.error(chalk.red('\nFailed to compile.'))
      console.error(err.message)
      process.exit(1)
    } else if (err.type === 'FatalError') {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
