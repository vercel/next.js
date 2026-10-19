import fs from 'fs-extra'
import { promises as fsPromises } from 'fs'
import os from 'os'
import path from 'path'

/**
 * Create a randomly-named directory in `os.tmpdir()`, await a function call,
 * and delete the directory when finished, unless `NEXT_TEST_SKIP_CLEANUP` is set.
 */
export async function useTempDir(
  fn: (folder: string) => void | Promise<void>,
  mode?: string | number
) {
  const folder = path.join(
    os.tmpdir(),
    'next-test-' + Math.random().toString(36).slice(2)
  )
  await fs.mkdirp(folder)

  if (mode) {
    await fs.chmod(folder, mode)
  }

  try {
    await fn(folder)
  } finally {
    if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
      // Use Node's native `rm` rather than fs-extra's `remove()`. On Windows, a
      // freshly installed project can briefly be locked (EPERM/EBUSY), e.g. by
      // antivirus or a lingering child process. fs-extra@9's rimraf then runs
      // `assert(er instanceof Error)`, which fails under Jest because fs errors
      // come from a different realm. The assert throws inside an fs callback,
      // so `remove()` never settles and the test hangs until it times out.
      //
      // `maxRetries` makes Node retry transient filesystem errors with a
      // linear backoff, which handles short-lived Windows locks.
      await fsPromises.rm(folder, {
        recursive: true,
        force: true,
        maxRetries: 10,
      })
    }
  }
}
