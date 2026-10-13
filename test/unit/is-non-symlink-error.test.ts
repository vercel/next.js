import { isNonSymlinkReadlinkError } from 'next/dist/build/lib/is-non-symlink-error'

function errWithCode(code: string): Error {
  const err = new Error(`simulated ${code}`) as NodeJS.ErrnoException
  err.code = code
  return err
}

describe('isNonSymlinkReadlinkError', () => {
  it('treats EINVAL as "not a symlink" (Linux/macOS non-symlink)', () => {
    expect(isNonSymlinkReadlinkError(errWithCode('EINVAL'))).toBe(true)
  })

  it('treats ENOENT as "not a symlink" (path does not exist)', () => {
    expect(isNonSymlinkReadlinkError(errWithCode('ENOENT'))).toBe(true)
  })

  it('treats UNKNOWN as "not a symlink" (platform-specific catch-all)', () => {
    expect(isNonSymlinkReadlinkError(errWithCode('UNKNOWN'))).toBe(true)
  })

  it('treats EISDIR as "not a symlink" (Windows non-C: drive regression)', () => {
    // Regression test for #45067: on Windows, `next build` on a drive
    // other than C:/ raised
    //   EISDIR: illegal operation on a directory, readlink <file>.tsx
    // for every traced file. The wrapper must return null instead of
    // bubbling the error.
    expect(isNonSymlinkReadlinkError(errWithCode('EISDIR'))).toBe(true)
  })

  it('does not swallow unrelated I/O errors', () => {
    expect(isNonSymlinkReadlinkError(errWithCode('EACCES'))).toBe(false)
    expect(isNonSymlinkReadlinkError(errWithCode('EMFILE'))).toBe(false)
    expect(isNonSymlinkReadlinkError(errWithCode('EIO'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isNonSymlinkReadlinkError(undefined)).toBe(false)
    expect(isNonSymlinkReadlinkError(null)).toBe(false)
    expect(isNonSymlinkReadlinkError('EISDIR')).toBe(false)
    expect(isNonSymlinkReadlinkError({ code: 'EISDIR' })).toBe(false)
  })
})
