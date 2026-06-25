/**
 * `next internal prewarm-dev [directory]`
 *
 * Seeds the Turbopack dev persistent cache by compiling every entrypoint
 * in the project.  After this command completes, subsequent `next dev`
 * cold starts are faster because the Turbopack cache is already populated.
 *
 * Turbopack only — the command always forces `TURBOPACK=1` for the worker.
 */

import { fork } from 'child_process'
import { initialEnv } from '@next/env'

import * as Log from '../../build/output/log'
import { getProjectDir } from '../../lib/get-project-dir'

export async function prewarmDev(directory?: string): Promise<void> {
  // `getProjectDir` already exits with a friendly message when the directory
  // doesn't exist, so we don't need a separate `existsSync` check here.
  const dir = getProjectDir(directory)

  const startTime = Date.now()
  await runPrewarmWorker(dir)
  const durationMs = Date.now() - startTime

  // Detailed success/abort/failure messages are already logged by the worker;
  // the parent just adds the wall-clock duration.
  Log.info(`Prewarm finished in ${(durationMs / 1000).toFixed(1)}s.`)
}

/**
 * Fork a child worker that reuses the same `start-server` bootstrap path that
 * `next dev` uses, but with `__NEXT_PRIVATE_PREWARM_DEV=1` so the worker
 * dispatches to `prewarmDevServer` instead of starting an HTTP server.
 *
 * Resolves when the worker exits with code 0; rejects with the worker's
 * exit info on a non-zero exit.  The child's stdio is inherited so any error
 * output is already visible to the user.
 */
function runPrewarmWorker(dir: string): Promise<void> {
  const startServerPath = require.resolve('../../server/lib/start-server')
  const defaultEnv = (initialEnv || process.env) as typeof process.env

  return new Promise<void>((resolve, reject) => {
    const child = fork(startServerPath, {
      stdio: 'inherit',
      env: {
        ...defaultEnv,
        // Always use Turbopack for prewarm.
        TURBOPACK: '1',
        NEXT_PRIVATE_WORKER: '1',
        __NEXT_PRIVATE_PREWARM_DEV: '1',
        __NEXT_DEV_SERVER: '1',
      },
    })

    // When run from a terminal, Ctrl+C delivers SIGINT to the entire process
    // group, so the child receives it directly.  This forwarder is here for
    // the SIGTERM-from-supervisor case (e.g. systemd, Docker stop).  After
    // forwarding we just wait for the child to exit on its own.
    const forward = (signal: NodeJS.Signals) => () => child.kill(signal)
    process.on('SIGINT', forward('SIGINT'))
    process.on('SIGTERM', forward('SIGTERM'))

    child.on('message', (msg: any) => {
      if (msg && typeof msg === 'object' && msg.nextWorkerReady) {
        // Worker is up — send it the prewarm options.
        child.send({ nextWorkerOptions: { dir } })
      }
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else if (signal) {
        reject(new Error(`Prewarm worker terminated by signal ${signal}.`))
      } else {
        reject(new Error(`Prewarm worker exited with code ${code}.`))
      }
    })
  })
}
