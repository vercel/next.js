/**
 * Unit tests for `convertSegmentPathToStaticExportFilename`.
 *
 * The key invariant is that the function produces a valid flat filename
 * regardless of whether the input uses forward slashes (POSIX) or backslashes
 * (Windows). On Windows, `path.relative()` in `collectSegmentPathsImpl`
 * returns backslash-separated paths. If the function only handled forward
 * slashes, backslashes would survive into the filename and be interpreted as
 * directory separators by `path.join`, producing nested directories instead of
 * a flat `__next.*.txt` file — causing all RSC segment prefetch requests to
 * 404 when serving a static export built on Windows.
 */

import { convertSegmentPathToStaticExportFilename } from '../../packages/next/src/shared/lib/segment-cache/segment-value-encoding'

describe('convertSegmentPathToStaticExportFilename', () => {
  it('converts a simple segment path with forward slashes', () => {
    expect(convertSegmentPathToStaticExportFilename('/_tree')).toBe(
      '__next._tree.txt'
    )
  })

  it('converts a nested segment path with forward slashes', () => {
    expect(convertSegmentPathToStaticExportFilename('/foo/bar/__PAGE__')).toBe(
      '__next.foo.bar.__PAGE__.txt'
    )
  })

  it('converts a nested segment path with backslashes (Windows path.relative() output)', () => {
    // On Windows, `path.relative()` returns 'foo\\bar\\__PAGE__'.
    // The function must handle this the same way as the forward-slash variant.
    expect(
      convertSegmentPathToStaticExportFilename('/foo\\bar\\__PAGE__')
    ).toBe('__next.foo.bar.__PAGE__.txt')
  })

  it('produces a flat filename with no path separators', () => {
    const filename = convertSegmentPathToStaticExportFilename(
      '/foo\\bar\\__PAGE__'
    )
    expect(filename).not.toContain('/')
    expect(filename).not.toContain('\\')
  })

  it('handles mixed forward and backslashes', () => {
    expect(
      convertSegmentPathToStaticExportFilename('/foo/bar\\baz/__PAGE__')
    ).toBe('__next.foo.bar.baz.__PAGE__.txt')
  })
})
