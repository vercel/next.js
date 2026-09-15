import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { copyTracedFiles } from '../../../../packages/next/src/build/utils'

/**
 * Direct test for copyTracedFiles - verifies that symlinks are correctly
 * recreated in the standalone output directory on Windows.
 *
 * On Windows, when creating a symlink where the target doesn't exist yet,
 * Node.js defaults to creating a file-type symlink. The fix detects the
 * original file type via tracedFilePath and passes the correct type to fs.symlink().
 */
describe('symlink-on-windows', () => {
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

    // Create NFT trace file that includes symlinks
    // Paths in the trace are relative to the trace file location (distDir)
    // So '../src/real-dir/inner.ts' means distDir/../src/real-dir/inner.ts = src/real-dir/inner.ts
    const traceData = {
      files: [
        '../src/real-dir/inner.ts',
        '../src/real-file.ts',
        '../src/symlink-dir',
        '../src/symlink-file',
      ],
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
    if (process.platform !== 'win32') {
      return
    }

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

    // Verify real files/directories are copied correctly
    const realDirStat = await fs.stat(path.join(standaloneDir, 'real-dir'))
    expect(realDirStat.isDirectory()).toBe(true)

    const realFileStat = await fs.stat(path.join(standaloneDir, 'real-file.ts'))
    expect(realFileStat.isFile()).toBe(true)

    // Verify symlink-dir is a directory symlink
    const symlinkDirStat = await fs.lstat(
      path.join(standaloneDir, 'symlink-dir')
    )
    expect(symlinkDirStat.isSymbolicLink()).toBe(true)
    const symlinkDirTarget = await fs.stat(
      path.join(standaloneDir, 'symlink-dir')
    )
    expect(symlinkDirTarget.isDirectory()).toBe(true)

    // Verify symlink-file is a file symlink
    const symlinkFileStat = await fs.lstat(
      path.join(standaloneDir, 'symlink-file')
    )
    expect(symlinkFileStat.isSymbolicLink()).toBe(true)
    const symlinkFileTarget = await fs.stat(
      path.join(standaloneDir, 'symlink-file')
    )
    expect(symlinkFileTarget.isFile()).toBe(true)

    // Verify content is accessible through symlinks
    const dirContent = await fs.readFile(
      path.join(standaloneDir, 'symlink-dir', 'inner.ts'),
      'utf8'
    )
    expect(dirContent).toBe('export const value = 1')

    const fileContent = await fs.readFile(
      path.join(standaloneDir, 'symlink-file'),
      'utf8'
    )
    expect(fileContent).toBe('export const value = 2')
  })
})
