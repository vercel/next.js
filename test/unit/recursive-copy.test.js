/* eslint-env jest */
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'
import fs from 'fs-extra'

const sourceDir = join(__dirname, 'recursive-folder-test')
const destDir = join(__dirname, 'recursive-folder-test-copy')

describe('recursiveCopy', () => {
  it('should work', async () => {
    await recursiveCopy(sourceDir, destDir, {
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

    await fs.remove(destDir)
  })
})
