import fs from 'node:fs/promises'
import path from 'node:path'

const INVALIDATION_MARKER = '__nextjs_invalidated_cache'

/**
 * Atomically write an invalidation marker.
 *
 * Because attempting to delete currently open cache files could cause issues,
 * actual deletion of files is deferred until the next start-up (in
 * `checkFileSystemCacheInvalidationAndCleanup`).
 *
 * In the case that no database is currently open (e.g. via a separate CLI
 * subcommand), you should call `cleanupFileSystemCache` *after* this to eagerly
 * remove the cache files.
 */
export async function invalidateFileSystemCache(cacheDirectory: string) {
  let file
  try {
    // We're just opening it so that `open()` creates the file.
    file = await fs.open(path.join(cacheDirectory, INVALIDATION_MARKER), 'w')
    // We don't currently write anything to the file, but we could choose to
    // later, e.g. a reason for the invalidation.
  } catch (err: any) {
    // it's valid for the cache to not exist at all
    if (err.code !== 'ENOENT') {
      throw err
    }
  } finally {
    file?.close()
  }
}

/**
 * Called during startup. See if the cache is in a partially-completed
 * invalidation state. Finds and delete any invalidated cache files.
 */
export async function checkFileSystemCacheInvalidationAndCleanup(
  cacheDirectory: string
) {
  const invalidated = await fs
    .access(path.join(cacheDirectory, INVALIDATION_MARKER))
    .then(
      () => true,
      () => false
    )
  if (invalidated) {
    await cleanupFileSystemCache(cacheDirectory)
  }
}

/**
 * Helper for `checkFileSystemCacheInvalidationAndCleanup`. You can call this to
 * explicitly clean up a database after running `invalidateFileSystemCache` when
 * webpack is not running.
 *
 * You should not run this if the cache has not yet been invalidated, as this
 * operation is not atomic and could result in a partially-deleted and corrupted
 * database.
 */
async function cleanupFileSystemCache(cacheDirectory: string) {
  try {
    await cleanupFileSystemCacheInner(cacheDirectory)
  } catch (e) {
    // generate a user-friendly error message
    throw new Error(
      `Unable to remove an invalidated webpack cache. If this issue persists ` +
        `you can work around it by deleting ${cacheDirectory}`,
      { cause: e }
    )
  }
}

async function cleanupFileSystemCacheInner(cacheDirectory: string) {
  const files = await fs.readdir(cacheDirectory)

  // delete everything except the invalidation marker
  await Promise.all(
    files.map((name) =>
      name !== INVALIDATION_MARKER
        ? fs.rm(path.join(cacheDirectory, name), {
            force: true, // ignore errors if path does not exist
            recursive: true,
            maxRetries: 2, // windows prevents deletion of open files
          })
        : null
    )
  )

  // delete the invalidation marker last, once we're sure everything is cleaned
  // up
  await fs.rm(path.join(cacheDirectory, INVALIDATION_MARKER), {
    force: true,
    maxRetries: 2,
  })
}
