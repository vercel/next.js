import spawn from 'cross-spawn'
import path from 'path'

import type { ResolvedNextConfig } from './resolved-config'

const { MARKER } = require('./load-config-child.js')

const CHILD_SCRIPT = path.join(__dirname, 'load-config-child.js')
const TIMEOUT_MS = 60 * 1000

export type LoadResolvedConfigOptions = {
  /** The fixture's test directory. */
  dir: string
  /** `PHASE_PRODUCTION_BUILD` / `PHASE_DEVELOPMENT_SERVER`. */
  phase: string
  /** The fixture's spawn env, from `NextInstance.getSpawnOpts()`. */
  env?: NodeJS.ProcessEnv
}

/**
 * Resolves a fixture's `next.config` in a child process. Costs ~0.15s, and is
 * only ever paid by a suite that actually has a lazy `@gate`.
 */
export function loadResolvedConfig({
  dir,
  phase,
  env,
}: LoadResolvedConfigOptions): Promise<ResolvedNextConfig> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD_SCRIPT, dir, phase], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout!.on('data', (chunk) => (stdout += chunk))
    child.stderr!.on('data', (chunk) => (stderr += chunk))

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(
        new Error(
          `Timed out after ${TIMEOUT_MS}ms resolving the next.config of ${dir} ` +
            `for a \`@gate\` condition.`
        )
      )
    }, TIMEOUT_MS)

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      const start = stdout.indexOf(MARKER)
      if (code !== 0 || start === -1) {
        reject(
          new Error(
            `Failed to resolve the next.config of ${dir} for a \`@gate\` ` +
              `condition (phase ${phase}, exit code ${code}).\n${stderr}`
          )
        )
        return
      }
      try {
        resolve(JSON.parse(stdout.slice(start + MARKER.length)))
      } catch (error) {
        reject(error)
      }
    })
  })
}
