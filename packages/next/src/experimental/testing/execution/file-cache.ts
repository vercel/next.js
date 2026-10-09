import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/** The action must not settle until the file process has closed. */
export async function withFileCacheDirectory<T>(
  action: (directory: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'next-test-cache-'))
  let failed = false
  let executionError: unknown
  try {
    return await action(directory)
  } catch (error) {
    failed = true
    executionError = error
    throw error
  } finally {
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (error) {
      if (failed) {
        throw new AggregateError(
          [executionError, error],
          'Test execution and file cache cleanup failed'
        )
      }
      throw error
    }
  }
}
