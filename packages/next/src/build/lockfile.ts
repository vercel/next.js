import fs from 'fs'
import nodePath from 'path'
import { bold, cyan } from '../lib/picocolors'
import * as Log from './output/log'
import { getBindingsSync } from './swc'

import type { Binding, Lockfile as NativeLockfile } from './swc/types'

const RETRY_DELAY_MS = 10
const MAX_RETRY_MS = 1000

/**
 * Information about a running dev server, stored inside the lock file itself.
 * This is a common pattern in Unix applications (e.g., storing PID in a lockfile).
 */
export interface DevServerInfo {
  pid: number
  port: number
  hostname: string
  appUrl: string
  startedAt: number
}

/**
 * Reads dev server info from a lockfile.
 * Returns undefined if the file doesn't exist or can't be parsed.
 *
 * Uses Node's fs.readFileSync which works on both Unix (with advisory flock)
 * and Windows (with FILE_SHARE_READ flag set by the lock holder).
 */
export function readLockfileContent(lockfilePath: string): string | undefined {
  try {
    return fs.readFileSync(lockfilePath, 'utf-8')
  } catch {
    return undefined
  }
}

/**
 * Parses dev server info from lockfile content.
 */
export function parseDevServerInfo(content: string): DevServerInfo | undefined {
  try {
    return JSON.parse(content) as DevServerInfo
  } catch {
    return undefined
  }
}

/**
 * A cross-platform on-disk best-effort advisory exclusive lockfile
 * implementation.
 *
 * On Windows, this opens a file in write mode with the `FILE_SHARE_WRITE` flag
 * unset, so it still allows reading the lockfile. This avoids breaking tools
 * that read the contents of `.next`.
 *
 * On POSIX platforms, this uses `flock()` via `std::fs::File::try_lock`:
 * https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock
 *
 * On WASM, a dummy implementation is used which always "succeeds" in acquiring
 * the lock.
 *
 * This provides a more idiomatic wrapper around the lockfile APIs exposed on
 * the native bindings object.
 *
 * If this lock is not explicitly closed with `unlock`, we will:
 * - If `unlockOnExit` is set (the default), it will make a best-effort attempt
 *   to unlock the lockfile using `process.on('exit', ...)`. This is preferrable
 *   on Windows where it may take some time after process exit for the operating
 *   system to clean up locks that are not explicitly released by the process.
 * - If we fail to ever release the lockfile, the operating system will clean up
 *   the lock and file descriptor upon process exit.
 */
export class Lockfile {
  /**
   * The underlying `Lockfile` object returned by the native bindings.
   *
   * This can be `undefined` on wasm, where we don't acquire a real lockfile.
   */
  private bindings: Binding
  private nativeLockfile: NativeLockfile | undefined
  private listener: NodeJS.ExitListener | undefined

  private constructor(
    bindings: Binding,
    nativeLockfile: NativeLockfile | undefined
  ) {
    this.bindings = bindings
    this.nativeLockfile = nativeLockfile
  }

  /**
   * Attempts to create or acquire an exclusive lockfile on disk. Lockfiles are
   * best-effort, depending on the platform.
   *
   * - If we fail to acquire the lock, we return `undefined`.
   * - If we're on wasm, this always returns a dummy `Lockfile` object.
   *
   * @param path - Path to the lock file
   * @param unlockOnExit - Whether to unlock the file on process exit
   * @param content - Optional content to write to the lockfile (e.g., JSON with server info)
   */
  static tryAcquire(
    path: string,
    unlockOnExit: boolean = true,
    content?: string
  ): Lockfile | undefined {
    const bindings = getBindingsSync()
    if (bindings.isWasm) {
      Log.info(
        `Skipping creating a lockfile at ${cyan(path)} because we're using WASM bindings`
      )
      return new Lockfile(bindings, undefined)
    } else {
      let nativeLockfile
      try {
        nativeLockfile = bindings.lockfileTryAcquireSync(path, content)
      } catch (e) {
        // this happens if there's an IO error (e.g. `ENOENT`), which is
        // different than if we just didn't acquire the lock
        throw new Error(
          'An IO error occurred while attempting to create and acquire the lockfile',
          { cause: e }
        )
      }
      if (nativeLockfile != null) {
        const jsLockfile = new Lockfile(bindings, nativeLockfile)
        if (unlockOnExit) {
          const exitListener = () => {
            // Best-Effort: If we don't do this, the operating system will
            // release the lock for us. This gives an opportunity to delete the
            // unlocked lockfile (which is not otherwise deleted on POSIX).
            //
            // This must be synchronous because `process.on('exit', ...)` is
            // synchronous.
            jsLockfile.unlockSync()
          }
          process.on('exit', exitListener)
          jsLockfile.listener = exitListener
        }
        return jsLockfile
      } else {
        return undefined
      }
    }
  }

  /**
   * Attempts to create or acquire a lockfile using `Lockfile.tryAcquire`. If
   * that returns `undefined`, indicating that another process or caller has the
   * lockfile, then this will output an error message and exit the process with
   * a non-zero exit code.
   *
   * This will retry a small number of times. This can be useful when running
   * processes in a loop, e.g. if cleanup isn't fully synchronous due to child
   * parent/processes.
   *
   * @param path - Path to the lock file
   * @param processName - Name of the process for error messages (e.g., 'next dev')
   * @param unlockOnExit - Whether to unlock the file on process exit
   * @param content - Optional content to write to the lockfile (e.g., JSON with server info)
   * @param projectDir - Optional project directory for enhanced error messages
   * @param relativeDistDir - Optional relative dist directory path (e.g., '.next/dev')
   */
  static async acquireWithRetriesOrExit(
    path: string,
    processName: string,
    unlockOnExit: boolean = true,
    content?: string,
    projectDir?: string,
    relativeDistDir?: string
  ): Promise<Lockfile> {
    const startMs = Date.now()
    let lockfile
    while (Date.now() - startMs < MAX_RETRY_MS) {
      lockfile = Lockfile.tryAcquire(path, unlockOnExit, content)
      if (lockfile !== undefined) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
    if (lockfile === undefined) {
      const isDev = processName === 'next dev'

      if (isDev) {
        // For dev server, try to read server info from the lockfile itself
        const lockfileContent = readLockfileContent(path)
        const serverInfo = lockfileContent
          ? parseDevServerInfo(lockfileContent)
          : undefined

        if (serverInfo) {
          Log.error(`Another ${cyan(processName)} server is already running.`)
          console.error()
          console.error(`- Local:        ${cyan(serverInfo.appUrl)}`)
          console.error(`- PID:          ${serverInfo.pid}`)
          if (projectDir) {
            console.error(`- Dir:          ${projectDir}`)
          }
          if (relativeDistDir) {
            console.error(
              `- Log:          ${nodePath.join(relativeDistDir, 'logs', 'next-development.log')}`
            )
          }
          console.error()
          // Use platform-appropriate kill command
          const killCommand =
            process.platform === 'win32'
              ? `taskkill /PID ${serverInfo.pid} /F`
              : `kill ${serverInfo.pid}`
          console.error(`Run ${cyan(killCommand)} to stop it.`)
        } else {
          // Fallback when we can't read server info from the lockfile
          Log.error(
            `Another ${cyan(processName)} server is already running in this directory.`
          )
          console.error(`Stop the other server before starting a new one.`)
        }
      } else {
        // For build, show that a build is in progress
        Log.error(`Another ${cyan(processName)} process is already running.`)
        console.error()
        console.error(`  This could be:`)
        console.error(`  - A ${cyan('next build')} still in progress`)
        console.error(`  - A previous build that didn't exit cleanly`)
        console.error()
        Log.info(`${bold('Suggestion:')} Wait for the build to complete.`)
      }
      process.exit(1)
    }
    return lockfile
  }

  /**
   * Releases the lockfile and closes the file descriptor.
   *
   * If this is not called, the lock will be released by the operating system
   * when the file handle is closed during process exit.
   */
  async unlock(): Promise<void> {
    const { nativeLockfile, listener } = this
    if (nativeLockfile !== undefined) {
      await this.bindings.lockfileUnlock(nativeLockfile)
    }
    if (listener !== undefined) {
      process.off('exit', listener)
    }
  }

  /**
   * A blocking version of `unlock`.
   */
  unlockSync(): void {
    const { nativeLockfile, listener } = this
    if (nativeLockfile !== undefined) {
      this.bindings.lockfileUnlockSync(nativeLockfile)
    }
    if (listener !== undefined) {
      process.off('exit', listener)
    }
  }
}
