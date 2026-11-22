import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

/** Set when `next build` runs a Go executable only to initialize it. */
export const NATIVE_ROUTE_STARTUP_CHECK_ENV = '__NEXT_GO_STARTUP_CHECK'

const STARTUP_CHECK_TIMEOUT_MS = 30_000

/**
 * Production builds compile every route.go into one executable, so package
 * initialization for every route runs in one process. State that is harmless
 * in development, where each route has its own process, can then fail at
 * startup: two routes registering the same pattern on http.DefaultServeMux,
 * defining the same flag, or registering the same metric in a global
 * registry. Initialize each executable once, so such a failure fails the
 * build instead of the first request in production.
 */
export async function checkNativeRouteStartup(
  dir: string,
  distDir: string,
  entries: Iterable<string>
): Promise<void> {
  const serverDir = path.join(distDir, 'server')
  const executables = new Set<string>()
  for (const entry of entries) {
    const descriptor = JSON.parse(
      await fs.readFile(path.join(serverDir, entry), 'utf8')
    )
    if (typeof descriptor?.executable !== 'string') {
      throw new Error(`Invalid native route descriptor ${entry}`)
    }
    executables.add(path.join(serverDir, descriptor.executable))
  }
  for (const executable of executables) {
    await new Promise<void>((resolve, reject) => {
      execFile(
        executable,
        [],
        {
          // `next start` runs the executable from the project directory.
          cwd: dir,
          env: { ...process.env, [NATIVE_ROUTE_STARTUP_CHECK_ENV]: '1' },
          timeout: STARTUP_CHECK_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
        (error, _stdout, stderr) => {
          if (!error) return resolve()
          const reason = error.killed
            ? `did not finish initializing within ${STARTUP_CHECK_TIMEOUT_MS / 1000} seconds`
            : 'failed while initializing'
          reject(
            new Error(
              `The Go Route Handler executable ${reason}. In production, every route.go ` +
                `runs in one process, so package initialization (init functions and ` +
                `package-level variables) of every route runs together, using the build ` +
                `environment during this check.\n\n${String(stderr).trim()}`
            )
          )
        }
      )
    })
  }
}
