import chalk from 'chalk'
import { Worker } from 'jest-worker'
import { existsSync } from 'fs'
import { join } from 'path'
import { ESLINT_DEFAULT_DIRS } from './constants'
import { Telemetry } from '../telemetry/storage'
import { eventLintCheckCompleted } from '../telemetry/events'
import { CompileError } from './compile-error'

export async function verifyAndLint(
  dir: string,
  configLintDirs: string[] | undefined,
  numWorkers: number | undefined,
  enableWorkerThreads: boolean | undefined,
  telemetry: Telemetry
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

    const lintDirs = (configLintDirs ?? ESLINT_DEFAULT_DIRS).reduce(
      (res: string[], d: string) => {
        const currDir = join(dir, d)
        if (!existsSync(currDir)) return res
        res.push(currDir)
        return res
      },
      []
    )

    const lintResults = await lintWorkers.runLintCheck(dir, lintDirs, true)
    const lintOutput =
      typeof lintResults === 'string' ? lintResults : lintResults?.output

    if (typeof lintResults !== 'string' && lintResults?.eventInfo) {
      telemetry.record(
        eventLintCheckCompleted({
          ...lintResults.eventInfo,
          buildLint: true,
        })
      )
    }

    if (typeof lintResults !== 'string' && lintResults?.isError && lintOutput) {
      await telemetry.flush()
      throw new CompileError(lintOutput)
    }

    if (lintOutput) {
      console.log(lintOutput)
    }

    lintWorkers.end()
  } catch (err) {
    if (err.type === 'CompileError' || err instanceof CompileError) {
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
