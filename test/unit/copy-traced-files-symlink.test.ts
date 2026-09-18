import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { copyTracedFiles } from '../../packages/next/src/build/utils'

/**
 * Direct test for copyTracedFiles - verifies that symlinks are recreated in the
 * standalone output directory with the correct type on Windows.
 *
 * Windows symlinks are typed (file or dir) at creation time. `fs.symlink()`
 * without an explicit type infers it by looking at the target, so when the
 * target does not exist yet it silently falls back to a file symlink. A file
 * symlink pointing at a directory cannot be traversed afterwards - it fails
 * with EPERM.
 *
 * The traced set below deliberately contains only the symlinks and not their
 * targets, so the links are created while the targets are still missing from
 * the output directory. That is what makes the inference fall back; without the
 * fix, traversing the recreated directory symlink throws.
 */
describe('copyTracedFiles symlinks', () => {
  // Only Windows distinguishes file from directory symlinks, so there is
  // nothing to assert on other platforms. Gating here rather than inside the
  // test keeps a skipped suite from being reported as a pass. This runs for
  // real in the test-unit-windows CI job.
  if (process.platform !== 'win32') {
    it('should skip on non-windows platforms', () => {})
    return
  }

  let tmpDir: string
  let srcDir: string
  let distDir: string
  let tracingRoot: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copy-traced-test-'))
    srcDir = path.join(tmpDir, 'src')
    distDir = path.join(tmpDir, 'dist')
    tracingRoot = srcDir

    // Create source structure with symlinks:
    // src/
    //   real-dir/           (real directory)
    //     inner.ts
    //   real-file.ts        (real file)
    //   symlink-dir   -> ./real-dir     (directory symlink)
    //   symlink-file  -> ./real-file.ts (file symlink)
    await fs.mkdir(path.join(srcDir, 'real-dir'), { recursive: true })
    await fs.writeFile(
      path.join(srcDir, 'real-dir', 'inner.ts'),
      'export const value = 1'
    )
    await fs.writeFile(
      path.join(srcDir, 'real-file.ts'),
      'export const value = 2'
    )
    await fs.symlink('./real-dir', path.join(srcDir, 'symlink-dir'), 'dir')
    await fs.symlink(
      './real-file.ts',
      path.join(srcDir, 'symlink-file'),
      'file'
    )

    // Create dist directory
    await fs.mkdir(distDir, { recursive: true })

    // Create package.json in dist (required by copyTracedFiles)
    await fs.writeFile(
      path.join(distDir, 'package.json'),
      JSON.stringify({ name: 'test' })
    )

    // Create NFT trace file listing only the symlinks, so their targets are
    // absent from the output directory when the links are recreated.
    // Paths in the trace are relative to the trace file location (distDir).
    const traceData = {
      files: ['../src/symlink-dir', '../src/symlink-file'],
    }
    await fs.writeFile(
      path.join(distDir, 'next-server.js.nft.json'),
      JSON.stringify(traceData)
    )
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should create correct symlink types in standalone output', async () => {
    await copyTracedFiles(
      srcDir,
      distDir,
      [],
      undefined,
      tracingRoot,
      { distDir: '.next' } as any,
      { middleware: {}, functions: {} } as any,
      false,
      false,
      new Set()
    )

    const standaloneDir = path.join(distDir, 'standalone')
    const symlinkDir = path.join(standaloneDir, 'symlink-dir')
    const symlinkFile = path.join(standaloneDir, 'symlink-file')

    expect((await fs.lstat(symlinkDir)).isSymbolicLink()).toBe(true)
    expect((await fs.lstat(symlinkFile)).isSymbolicLink()).toBe(true)

    // Materialize the targets only now, after the links were created. Their
    // type is already fixed, so this is what reveals a wrong one.
    await fs.mkdir(path.join(standaloneDir, 'real-dir'), { recursive: true })
    await fs.writeFile(
      path.join(standaloneDir, 'real-dir', 'inner.ts'),
      'export const value = 1'
    )
    await fs.writeFile(
      path.join(standaloneDir, 'real-file.ts'),
      'export const value = 2'
    )

    // A file symlink pointing at a directory throws EPERM here.
    expect((await fs.stat(symlinkDir)).isDirectory()).toBe(true)
    expect(await fs.readFile(path.join(symlinkDir, 'inner.ts'), 'utf8')).toBe(
      'export const value = 1'
    )

    expect((await fs.stat(symlinkFile)).isFile()).toBe(true)
    expect(await fs.readFile(symlinkFile, 'utf8')).toBe(
      'export const value = 2'
    )
  })
})
