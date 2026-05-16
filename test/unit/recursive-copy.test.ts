/* eslint-env jest */

import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'
import fs from 'fs-extra'
import { readFileSync } from 'fs'

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

  await fs.ensureDir(testDir)

  // create src directory structure
  await fs.ensureDir(srcDir)
  await fs.outputFile(join(srcDir, '.hidden'), 'hidden')
  await fs.outputFile(join(srcDir, 'file'), 'file')
  await fs.outputFile(join(srcDir, 'folder1', 'file1'), 'file1')
  await fs.outputFile(join(srcDir, 'folder1', 'file2'), 'file2')
  await fs.ensureSymlink(join(srcDir, 'file'), join(srcDir, 'link'))
  await fs.ensureSymlink(join(srcDir, 'folder1'), join(srcDir, 'linkfolder'))

  for (let i = 0; i < numFiles - 6; i++) {
    const path = join(`folder-${i}`, `file-${i}`)
    await fs.outputFile(join(srcDir, path), `file-${i}`)
    paths.push(path)
  }
  return paths
}

describe('recursiveCopy', () => {
  if (process.platform === 'win32') {
    it('should skip on windows to avoid symlink issues', () => {})
    return
  }
  afterAll(() => fs.remove(testDir))

  it('should work', async () => {
    await fs.remove(testDir)
    await setupTestDir(6)

    await recursiveCopy(srcDir, destDir, {
      filter(path) {
        return path !== '/folder1/file1'
      },
    })

    expect(await fs.pathExists(join(destDir, '.hidden'))).toBe(true)
    expect(await fs.pathExists(join(destDir, 'file'))).toBe(true)
    expect(await fs.pathExists(join(destDir, 'link'))).toBe(true)
    expect(await fs.pathExists(join(destDir, 'folder1', 'file1'))).toBe(false)
    expect(await fs.pathExists(join(destDir, 'folder1', 'file2'))).toBe(true)
    expect(await fs.pathExists(join(destDir, 'linkfolder', 'file1'))).toBe(true)
    expect(await fs.pathExists(join(destDir, 'linkfolder', 'file2'))).toBe(true)

    expect(readFileSync(join(destDir, 'file'), 'utf8')).toBe('file')
    expect(readFileSync(join(destDir, 'link'), 'utf8')).toBe('file')
    expect(readFileSync(join(destDir, 'linkfolder', 'file1'), 'utf8')).toBe(
      'file1'
    )
  })

  it('should work with content existing in dest', async () => {
    await fs.remove(testDir)
    const paths = await setupTestDir(25)
    await recursiveCopy(srcDir, destDir)
    await recursiveCopy(srcDir, destDir, { overwrite: true })

    for (const path of paths) {
      expect(await fs.pathExists(join(destDir, path))).toBe(true)
    }
  })

  it('should handle more files than concurrency', async () => {
    await fs.remove(testDir)
    const paths = await setupTestDir(100)
    await recursiveCopy(srcDir, destDir, { concurrency: 50 })

    for (const path of paths) {
      expect(await fs.pathExists(join(destDir, path))).toBe(true)
    }
  })
})
