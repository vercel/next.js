import { bold, cyan } from '../lib/picocolors'
import * as Log from './output/log'

import type { Binding, Lockfile as NativeLockfile } from './swc/types'

const RETRY_DELAY_MS = 10
const MAX_RETRY_MS = 1000

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
   */
  static async tryAcquire(
    path: string,
    unlockOnExit: boolean = true
  ): Promise<Lockfile | undefined> {
    const { loadBindings } = require('./swc') as typeof import('./swc')
    // Ideally we could provide a sync version of `tryAcquire`, but
    // `loadBindings` is async. We're okay with skipping async-loaded wasm
    // bindings and the internal `loadNative` function is synchronous, but it
    // lacks some checks that `loadBindings` has.
    const bindings = await loadBindings()
    if (bindings.isWasm) {
      Log.info(
        `Skipping creating a lockfile at ${cyan(path)} because we're using WASM bindings`
      )
      return new Lockfile(bindings, undefined)
    } else {
      let nativeLockfile
      try {
        nativeLockfile = await bindings.lockfileTryAcquire(path)
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
   */
  static async acquireWithRetriesOrExit(
    path: string,
    processName: string,
    unlockOnExit: boolean = true
  ): Promise<Lockfile> {
    const startMs = Date.now()
    let lockfile
    while (Date.now() - startMs < MAX_RETRY_MS) {
      lockfile = await Lockfile.tryAcquire(path, unlockOnExit)
      if (lockfile !== undefined) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
    if (lockfile === undefined) {
      Log.error(
        `Unable to acquire lock at ${cyan(path)}, is another instance of ${cyan(processName)} running?`
      )
      Log.info(
        `${bold('Suggestion:')} If you intended to restart ${cyan(processName)}, terminate the other process, and then try again.`
      )
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
