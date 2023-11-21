/* eslint-env jest */

import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'
import fsp from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { ensureSymlink } from 'fs-extra'

const testDir = join(__dirname, 'recursive-folder-test')

const srcDir = join(testDir, 'src')
const destDir = join(testDir, 'dest')

const setupTestDir = async (numFiles = 100) => {
  const paths = [
    '.hidden',
    'file',
    'folder1/file1',
    'folder1/file2',
    'link',
    'linkfolder',
  ]

  await fsp.mkdir(testDir, { recursive: true })

  // create src directory structure
  await fsp.mkdir(srcDir, { recursive: true })
  await fsp.writeFile(join(srcDir, '.hidden'), 'hidden')
  await fsp.writeFile(join(srcDir, 'file'), 'file')
  await fsp.mkdir(join(srcDir, 'folder1'), { recursive: true })
  await fsp.writeFile(join(srcDir, 'folder1', 'file1'), 'file1')
  await fsp.writeFile(join(srcDir, 'folder1', 'file2'), 'file2')
  await ensureSymlink(join(srcDir, 'file'), join(srcDir, 'link'))
  await ensureSymlink(join(srcDir, 'folder1'), join(srcDir, 'linkfolder'))

  for (let i = 0; i < numFiles - 6; i++) {
    const path = join(`folder-${i}`, `file-${i}`)
    await fsp.mkdir(join(srcDir, `folder-${i}`), { recursive: true })
    await fsp.writeFile(join(srcDir, path), `file-${i}`)
    paths.push(path)
  }
  return paths
}

describe('recursiveCopy', () => {
  if (process.platform === 'win32') {
    it('should skip on windows to avoid symlink issues', () => {})
    return
  }
  afterAll(() => fsp.rm(testDir, { recursive: true, force: true }))

  it('should work', async () => {
    await fsp.rm(testDir, { recursive: true, force: true })
    await setupTestDir(6)

    await recursiveCopy(srcDir, destDir, {
      filter(path) {
        return path !== '/folder1/file1'
      },
    })

    expect(existsSync(join(destDir, '.hidden'))).toBe(true)
    expect(existsSync(join(destDir, 'file'))).toBe(true)
    expect(existsSync(join(destDir, 'link'))).toBe(true)
    expect(existsSync(join(destDir, 'folder1', 'file1'))).toBe(false)
    expect(existsSync(join(destDir, 'folder1', 'file2'))).toBe(true)
    expect(existsSync(join(destDir, 'linkfolder', 'file1'))).toBe(true)
    expect(existsSync(join(destDir, 'linkfolder', 'file2'))).toBe(true)

    expect(readFileSync(join(destDir, 'file'), 'utf8')).toBe('file')
    expect(readFileSync(join(destDir, 'link'), 'utf8')).toBe('file')
    expect(readFileSync(join(destDir, 'linkfolder', 'file1'), 'utf8')).toBe(
      'file1'
    )
  })

  it('should work with content existing in dest', async () => {
    await fsp.rm(testDir, { recursive: true, force: true })
    const paths = await setupTestDir(25)
    await recursiveCopy(srcDir, destDir)
    await recursiveCopy(srcDir, destDir, { overwrite: true })

    for (const path of paths) {
      expect(existsSync(join(destDir, path))).toBe(true)
    }
  })

  it('should handle more files than concurrency', async () => {
    await fsp.rm(testDir, { recursive: true, force: true })
    const paths = await setupTestDir(100)
    await recursiveCopy(srcDir, destDir, { concurrency: 50 })

    for (const path of paths) {
      expect(existsSync(join(destDir, path))).toBe(true)
    }
  })
})
