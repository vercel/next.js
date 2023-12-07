/* eslint-env jest */

import { getFilesInDir } from 'next/dist/lib/get-files-in-dir'
import { join } from 'path'
import fs from 'fs-extra'

const testDir = join(__dirname, 'get-files-in-dir-test')

const srcDir = join(testDir, 'src')

const setupTestDir = async () => {
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
  await fs.ensureSymlink(join(srcDir, 'link'), join(srcDir, 'link-level-2'))
  await fs.ensureSymlink(
    join(srcDir, 'link-level-2'),
    join(srcDir, 'link-level-3')
  )
  await fs.ensureSymlink(join(srcDir, 'folder1'), join(srcDir, 'linkfolder'))
  return paths
}

describe('getFilesInDir', () => {
  if (process.platform === 'win32') {
    it('should skip on windows to avoid symlink issues', () => {})
    return
  }
  afterAll(() => fs.remove(testDir))

  it('should work', async () => {
    await fs.remove(testDir)
    await setupTestDir()

    expect(await getFilesInDir(srcDir)).toIncludeAllMembers([
      '.hidden',
      'file',
      'link',
      'link-level-2',
      'link-level-3',
    ])
  })
})
