import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

type OutputFileSystem = NonNullable<webpack.Compiler['outputFileSystem']>
type WriteFile = OutputFileSystem['writeFile']
type WriteCallback = Parameters<WriteFile>[2]
type ErrorCallback = (err?: NodeJS.ErrnoException | null) => void

type RenameCapableFileSystem = OutputFileSystem & {
  rename?: (oldPath: string, newPath: string, callback: ErrorCallback) => void
  unlink?: (p: string, callback: ErrorCallback) => void
}

const MANIFEST_FILE_RE = /manifest\.(?:js|json)$/i
const ATOMIC_MANIFEST_WRITES = Symbol.for('next.atomicManifestWrites')

// Matches `lib/fs/rename` (and graceful-fs).
const WINDOWS_RENAME_RETRY_TIMEOUT = 60_000
const WINDOWS_RETRYABLE_RENAME_ERRORS = new Set(['EACCES', 'EPERM', 'EBUSY'])

/**
 * Whether the dev server reads this emitted file outside of webpack, e.g.
 * through `loadManifest` / `evalManifest`. `build-manifest.json`,
 * `next-font-manifest.json`, `page_client-reference-manifest.js` and so on.
 */
export function isManifestFile(filePath: string): boolean {
  return MANIFEST_FILE_RE.test(path.basename(filePath))
}

let tempFileCounter = 0

/**
 * Renames `from` over `to`. On Windows, retries errors caused by the target
 * being briefly locked (e.g. a concurrent reader or anti-virus), like
 * `lib/fs/rename`'s `renameSync` does. graceful-fs alone isn't enough, since
 * it stops retrying as soon as the target exists, which it always does here.
 */
function renameWithRetry(
  rename: NonNullable<RenameCapableFileSystem['rename']>,
  from: string,
  to: string,
  platform: NodeJS.Platform,
  callback: ErrorCallback
) {
  const start = Date.now()
  let backoff = 0
  const attempt = () => {
    rename(from, to, (err) => {
      if (
        err &&
        platform === 'win32' &&
        WINDOWS_RETRYABLE_RENAME_ERRORS.has(err.code!) &&
        Date.now() - start < WINDOWS_RENAME_RETRY_TIMEOUT
      ) {
        setTimeout(attempt, backoff)
        if (backoff < 100) backoff += 10
        return
      }
      callback(err)
    })
  }
  attempt()
}

/**
 * Makes webpack write manifest files atomically for this compiler.
 *
 * Webpack writes emitted assets in place, truncating the file first. In dev,
 * a request that renders an already-built route (it doesn't wait for an
 * in-flight rebuild) can read a manifest while it is being rewritten. It then
 * sees an empty or partial file and fails with `Manifest file is empty` or
 * `Unexpected end of JSON input`. Writing to a temp sibling and renaming it
 * over the target means a reader sees either the old or the new manifest.
 * This matches how Turbopack writes its manifests (`writeFileAtomic`).
 *
 * Webpack gives every compiler the same file system object, so this installs
 * a per-compiler wrapper instead of patching the shared object.
 */
export function enableAtomicManifestWrites(
  compiler: webpack.Compiler,
  { platform = process.platform }: { platform?: NodeJS.Platform } = {}
): void {
  const fs = compiler.outputFileSystem as RenameCapableFileSystem | null
  // Custom output file systems (e.g. in-memory) may not support rename. Leave
  // them alone. Also don't wrap twice.
  if (
    !fs ||
    typeof fs.rename !== 'function' ||
    (fs as any)[ATOMIC_MANIFEST_WRITES]
  ) {
    return
  }

  const writeFile = fs.writeFile.bind(fs)
  const rename = fs.rename.bind(fs)
  const unlink = fs.unlink?.bind(fs)

  const atomicWriteFile = ((
    filePath: string,
    content: Parameters<WriteFile>[1],
    callback: WriteCallback
  ) => {
    if (!isManifestFile(filePath)) {
      return writeFile(filePath, content, callback)
    }

    const tempPath = `${filePath}.${process.pid}.${++tempFileCounter}.tmp`
    const cleanup = (err: NodeJS.ErrnoException) => {
      if (!unlink) {
        return callback(err)
      }
      // Best effort. Report the original error, not a cleanup failure.
      unlink(tempPath, () => callback(err))
    }

    writeFile(tempPath, content, (writeErr) => {
      if (writeErr) {
        return cleanup(writeErr)
      }
      renameWithRetry(rename, tempPath, filePath, platform, (renameErr) => {
        if (renameErr) {
          return cleanup(renameErr)
        }
        callback(null)
      })
    })
  }) as WriteFile

  // Inherit every other method from the shared file system.
  const wrapped = Object.create(fs) as RenameCapableFileSystem
  wrapped.writeFile = atomicWriteFile
  ;(wrapped as any)[ATOMIC_MANIFEST_WRITES] = true
  compiler.outputFileSystem = wrapped
}
