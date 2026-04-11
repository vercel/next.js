import isError from '../../lib/is-error'

/**
 * Predicate used by the file-trace `readlink` wrappers. Returns `true`
 * when a `readlink` failure should be treated as "this path is not a
 * symlink" (so the caller returns `null`), and `false` when it should
 * bubble as a real I/O error.
 *
 * Node returns different error codes for the "not a symlink" case
 * depending on the platform and the target's real type:
 *
 * - **EINVAL** — Linux/macOS: the target exists but is not a symlink.
 * - **ENOENT** — the path does not exist.
 * - **UNKNOWN** — a catch-all for platform-specific codes we can't
 *   map cleanly.
 * - **EISDIR** — Windows: returned for certain non-symlink entries,
 *   notably when building projects on drives other than C:/. Without
 *   this catch, `next build` fails with
 *   `EISDIR: illegal operation on a directory, readlink <file>.tsx`
 *   for every traced file on such drives (issue #45067).
 */
export function isNonSymlinkReadlinkError(e: unknown): boolean {
  if (!isError(e)) return false
  const code = (e as NodeJS.ErrnoException).code
  return (
    code === 'EINVAL' ||
    code === 'ENOENT' ||
    code === 'UNKNOWN' ||
    code === 'EISDIR'
  )
}
