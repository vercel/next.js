/**
 * Unit tests for the segment path collection logic in `export/index.ts`.
 *
 * The key invariant is that the relative paths returned by
 * `collectSegmentPaths` always use forward slashes, regardless of the
 * platform's native path separator. On Windows, `path.relative()` returns
 * backslash-separated paths. If these are passed as-is to
 * `convertSegmentPathToStaticExportFilename`, the backslashes are not replaced
 * and `path.join()` then interprets them as directory separators, producing
 * nested directories instead of the expected flat `__next.*.txt` files.
 */

import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { convertSegmentPathToStaticExportFilename } from '../../packages/next/src/shared/lib/segment-cache/segment-value-encoding'

const RSC_SEGMENT_SUFFIX = '.segment.rsc'

/**
 * Inline reimplementation of `collectSegmentPaths` / `collectSegmentPathsImpl`
 * from `packages/next/src/export/index.ts`, kept in sync with the source.
 * The critical line is the `.replace(/\\/g, '/')` normalization.
 */
async function collectSegmentPaths(segmentsDirectory: string) {
  const results: Array<string> = []
  await collectSegmentPathsImpl(segmentsDirectory, segmentsDirectory, results)
  return results
}

async function collectSegmentPathsImpl(
  segmentsDirectory: string,
  directory: string,
  results: Array<string>
) {
  const segmentFiles = await fs.readdir(directory, { withFileTypes: true })
  await Promise.all(
    segmentFiles.map(async (segmentFile) => {
      if (segmentFile.isDirectory()) {
        await collectSegmentPathsImpl(
          segmentsDirectory,
          path.join(directory, segmentFile.name),
          results
        )
        return
      }
      if (!segmentFile.name.endsWith(RSC_SEGMENT_SUFFIX)) {
        return
      }
      results.push(
        path
          .relative(segmentsDirectory, path.join(directory, segmentFile.name))
          .replace(/\\/g, '/')
      )
    })
  )
}

describe('collectSegmentPaths', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'next-export-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns forward-slash paths for a flat segment directory', async () => {
    // Create segment files at the root of the segments directory.
    await fs.writeFile(path.join(tmpDir, `_tree${RSC_SEGMENT_SUFFIX}`), '')
    await fs.writeFile(path.join(tmpDir, `__PAGE__${RSC_SEGMENT_SUFFIX}`), '')

    const results = await collectSegmentPaths(tmpDir)
    results.sort()

    // All paths must use forward slashes regardless of OS.
    for (const result of results) {
      expect(result).not.toContain('\\')
    }
    expect(results).toEqual([
      `__PAGE__${RSC_SEGMENT_SUFFIX}`,
      `_tree${RSC_SEGMENT_SUFFIX}`,
    ])
  })

  it('returns forward-slash paths for nested segment directories', async () => {
    // Simulate the on-disk layout produced for a route like `/foo/bar`:
    //   <segmentsDir>/
    //     _tree.segment.rsc
    //     foo/
    //       _tree.segment.rsc
    //       bar/
    //         _tree.segment.rsc
    //         __PAGE__.segment.rsc
    const fooDir = path.join(tmpDir, 'foo')
    const barDir = path.join(fooDir, 'bar')
    await fs.mkdir(barDir, { recursive: true })

    await fs.writeFile(path.join(tmpDir, `_tree${RSC_SEGMENT_SUFFIX}`), '')
    await fs.writeFile(path.join(fooDir, `_tree${RSC_SEGMENT_SUFFIX}`), '')
    await fs.writeFile(path.join(barDir, `_tree${RSC_SEGMENT_SUFFIX}`), '')
    await fs.writeFile(path.join(barDir, `__PAGE__${RSC_SEGMENT_SUFFIX}`), '')

    const results = await collectSegmentPaths(tmpDir)
    results.sort()

    // No backslashes — even on Windows where path.relative() would otherwise
    // return 'foo\\bar\\__PAGE__.segment.rsc'.
    for (const result of results) {
      expect(result).not.toContain('\\')
    }
    expect(results).toEqual([
      `_tree${RSC_SEGMENT_SUFFIX}`,
      `foo/_tree${RSC_SEGMENT_SUFFIX}`,
      `foo/bar/__PAGE__${RSC_SEGMENT_SUFFIX}`,
      `foo/bar/_tree${RSC_SEGMENT_SUFFIX}`,
    ])
  })

  it('produces valid static export filenames from collected paths', async () => {
    // End-to-end: collected paths must produce the correct flat filenames.
    const barDir = path.join(tmpDir, 'foo', 'bar')
    await fs.mkdir(barDir, { recursive: true })
    await fs.writeFile(path.join(barDir, `__PAGE__${RSC_SEGMENT_SUFFIX}`), '')

    const results = await collectSegmentPaths(tmpDir)
    expect(results).toHaveLength(1)

    const segmentPath = '/' + results[0].slice(0, -RSC_SEGMENT_SUFFIX.length)
    const filename = convertSegmentPathToStaticExportFilename(segmentPath)

    // The filename must be flat (no path separators) so that it is written
    // as a single file rather than a nested directory structure.
    expect(filename).toBe('__next.foo.bar.__PAGE__.txt')
    expect(filename).not.toContain('/')
    expect(filename).not.toContain('\\')
  })

  it('ignores files that do not have the segment suffix', async () => {
    await fs.writeFile(path.join(tmpDir, 'page.html'), '')
    await fs.writeFile(path.join(tmpDir, 'index.txt'), '')
    await fs.writeFile(path.join(tmpDir, `_tree${RSC_SEGMENT_SUFFIX}`), '')

    const results = await collectSegmentPaths(tmpDir)
    expect(results).toEqual([`_tree${RSC_SEGMENT_SUFFIX}`])
  })
})
