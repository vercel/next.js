import fs from 'fs/promises'
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
  await fs.mkdir(folder, { recursive: true })

  if (mode) {
    await fs.chmod(folder, mode)
  }

  try {
    await fn(folder)
  } finally {
    if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
      await fs.rm(folder, {
        recursive: true,
        force: true,
        // It seems like there's a timing issue where `.next` is still written
        // to (possibly by a prior test) while this removal happens. Retry for now.
        // TODO: Fix this.
        maxRetries: 3,
      })
    }
  }
}
