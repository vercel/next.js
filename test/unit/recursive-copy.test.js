/* eslint-env jest */
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { recursiveDelete } from 'next/dist/lib/recursive-delete'
import { join } from 'path'
import fs from 'fs'
import { promisify } from 'util'

const rmdir = promisify(fs.rmdir)

const resolveDataDir = join(__dirname, 'recursive-folder-test')
const testResolveDataDir = join(__dirname, 'recursive-folder-test-copy')

afterEach(async () => {
  await recursiveDelete(testResolveDataDir)
  await rmdir(testResolveDataDir)
})

describe('recursiveCopy', () => {
  it('should work', async () => {
    await recursiveCopy(resolveDataDir, testResolveDataDir)

    const result = await recursiveReadDir(testResolveDataDir, /.*/)

    expect(result).toContain('/.hidden')
    expect(result).toContain('/file')
    expect(result).toContain('/link')
    expect(result).toContain('/folder1/file1')
    expect(result).toContain('/folder1/file2')
    expect(result).toContain('/linkfolder/file1')
    expect(result).toContain('/linkfolder/file2')
    expect(result.length).toBe(7)
  })
})
