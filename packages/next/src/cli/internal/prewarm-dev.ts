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
import os from 'os'
import { initialEnv } from '@next/env'

import * as Log from '../../build/output/log'
import { getProjectDir } from '../../lib/get-project-dir'

export async function prewarmDev(directory?: string): Promise<void> {
  // `getProjectDir` already exits with a friendly message when the directory
  // doesn't exist, so we don't need a separate `existsSync` check here.
  const dir = getProjectDir(directory)

  const startTime = Date.now()
  const result = await runPrewarmWorker(dir)

  if (result.kind === 'signal' || result.kind === 'sigint-exit') {
    // The user (or a supervisor) interrupted us — exit silently with the
    // same code the child reported, no stack trace.  Conventionally
    // `128 + signal` for signal terminations.
    const exitCode =
      result.kind === 'sigint-exit'
        ? result.code
        : 128 + (os.constants.signals[result.signal] ?? 0)
    process.exit(exitCode)
  }
  if (result.kind === 'error') throw result.error

  const durationMs = Date.now() - startTime
  // Detailed success messages are already logged by the worker;
  // the parent just adds the wall-clock duration.
  Log.info(`Prewarm finished in ${(durationMs / 1000).toFixed(1)}s.`)
}

type PrewarmResult =
  | { kind: 'ok' }
  // Killed by signal (no exit code reported by the child).
  | { kind: 'signal'; signal: NodeJS.Signals }
  // Exited cleanly with a SIGINT/SIGTERM exit code (128 + N).  The prewarm
  // worker installs hard-exit signal handlers that exit with this code, so
  // we see a `code` rather than a `signal` here.
  | { kind: 'sigint-exit'; code: 130 | 143 }
  | { kind: 'error'; error: Error }

/**
 * Fork a child worker that reuses the same `start-server` bootstrap path that
 * `next dev` uses, but with `__NEXT_PRIVATE_PREWARM_DEV=1` so the worker
 * dispatches to `prewarmDevServer` instead of starting an HTTP server.
 *
 * Resolves with a tagged result describing how the child exited.  Signal
 * terminations are surfaced separately so the caller can exit silently
 * rather than throwing a noisy stack trace at the user.
 */
function runPrewarmWorker(dir: string): Promise<PrewarmResult> {
  const startServerPath = require.resolve('../../server/lib/start-server')
  const defaultEnv = (initialEnv || process.env) as typeof process.env

  return new Promise<PrewarmResult>((resolve) => {
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

    child.on('error', (error) => resolve({ kind: 'error', error }))
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve({ kind: 'ok' })
      } else if (signal) {
        resolve({ kind: 'signal', signal })
      } else if (code === 130 || code === 143) {
        resolve({ kind: 'sigint-exit', code })
      } else {
        resolve({
          kind: 'error',
          error: new Error(`Prewarm worker exited with code ${code}.`),
        })
      }
    })
  })
}
