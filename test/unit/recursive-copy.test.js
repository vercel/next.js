/* eslint-env jest */
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'
import fs from 'fs-extra'
import { readFileSync } from 'fs'

const testDir = join(__dirname, 'recursive-folder-test')

const srcDir = join(testDir, 'src')
const destDir = join(testDir, 'dest')

beforeEach(async () => {
  await fs.ensureDir(testDir)

  // create src directory structure
  await fs.ensureDir(srcDir)
  await fs.outputFile(join(srcDir, '.hidden'), 'hidden')
  await fs.outputFile(join(srcDir, 'file'), 'file')
  await fs.outputFile(join(srcDir, 'folder1', 'file1'), 'file1')
  await fs.outputFile(join(srcDir, 'folder1', 'file2'), 'file2')
  await fs.ensureSymlink(join(srcDir, 'file'), join(srcDir, 'link'))
  await fs.ensureSymlink(join(srcDir, 'folder1'), join(srcDir, 'linkfolder'))
})

afterEach(async () => {
  await fs.remove(testDir)
})

describe('recursiveCopy', () => {
  it('should work', async () => {
    await recursiveCopy(srcDir, destDir, {
      filter (path) {
        return path !== '/folder1/file1'
      }
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
})
