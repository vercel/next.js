/**
 * `next internal prewarm-dev [directory]`
 *
 * Seeds the Turbopack dev persistent cache by compiling every route in the
 * project.  After this command completes, subsequent `next dev` starts are
 * faster because the Turbopack cache is already populated.
 *
 * Turbopack only.  If the project uses webpack the command exits with a
 * message explaining this.
 */

import path from 'path'
import { fork } from 'child_process'
import { initialEnv } from '@next/env'
import { getProjectDir } from '../../lib/get-project-dir'
import { printAndExit } from '../../server/lib/utils'
import { existsSync } from 'fs'
import * as Log from '../../build/output/log'

export async function prewarmDev(directory?: string): Promise<void> {
  const dir = getProjectDir(directory)

  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  // Fork a child worker that reuses the same start-server bootstrap path that
  // `next dev` uses, but with __NEXT_PRIVATE_PREWARM_DEV=1 to signal that it
  // should run the prewarm logic instead of starting an HTTP server.
  const startServerPath = require.resolve('../../server/lib/start-server')

  const startTime = Date.now()

  await new Promise<void>((resolve, reject) => {
    const defaultEnv = (initialEnv || process.env) as typeof process.env

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
          // The child is ready — send it the prewarm options.
          child.send({
            nextWorkerOptions: {
              dir: path.resolve(dir),
              port: 0,
              isDev: true,
            },
          })
        } else if (msg.nextPrewarmDone) {
          resolve()
        }
      }
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Prewarm worker exited with code ${code}`))
      }
    })
  })

  const durationMs = Date.now() - startTime
  Log.event(
    `Prewarm completed in ${(durationMs / 1000).toFixed(1)}s. The Turbopack dev cache is now seeded.`
  )
}
