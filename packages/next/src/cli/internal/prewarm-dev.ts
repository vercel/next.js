/**
 * `next internal prewarm-dev [directory]`
 *
 * Seeds the Turbopack dev persistent cache by compiling every route in the
 * project.  After this command completes, subsequent `next dev` cold starts
 * are faster because the Turbopack cache is already populated.
 *
 * Turbopack only — the command always forces `TURBOPACK=1` for the worker.
 */

import { fork } from 'child_process'
import { existsSync } from 'fs'
import { initialEnv } from '@next/env'

import * as Log from '../../build/output/log'
import { getProjectDir } from '../../lib/get-project-dir'
import { printAndExit } from '../../server/lib/utils'

export async function prewarmDev(directory?: string): Promise<void> {
  const dir = getProjectDir(directory)

  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  const startTime = Date.now()
  await runPrewarmWorker(dir, startTime)
  const durationMs = Date.now() - startTime

  Log.event(
    `Prewarm completed in ${(durationMs / 1000).toFixed(1)}s. ` +
      `The Turbopack dev cache is now seeded.`
  )
}

/**
 * Fork a child worker that reuses the same `start-server` bootstrap path that
 * `next dev` uses, but with `__NEXT_PRIVATE_PREWARM_DEV=1` so the worker
 * dispatches to `prewarmDevServer` instead of starting an HTTP server.
 *
 * Resolves when the worker signals `nextPrewarmDone` (or exits with code 0);
 * rejects on a non-zero exit.
 */
function runPrewarmWorker(dir: string, startTime: number): Promise<void> {
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
        NEXT_PRIVATE_START_TIME: String(startTime),
        PORT: '0',
      },
    })

    child.on('message', (msg: any) => {
      if (msg && typeof msg === 'object') {
        if (msg.nextWorkerReady) {
          // Worker is up — send it the prewarm options.
          child.send({
            nextWorkerOptions: { dir, port: 0, isDev: true },
          })
        } else if (msg.nextPrewarmDone) {
          resolve()
        }
      }
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Prewarm worker exited with code ${code}`))
    })
  })
}
