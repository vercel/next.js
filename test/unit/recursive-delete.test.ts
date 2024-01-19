/* eslint-env jest */
import fs from 'fs-extra'
import { recursiveDelete } from 'next/dist/lib/recursive-delete'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const testResolveDataDir = join(__dirname, 'isolated', 'test_resolvedata')
const testpreservefileDir = join(__dirname, 'isolated', 'preservefiles')

describe('recursiveDelete', () => {
  if (process.platform === 'win32') {
    it('should skip on windows to avoid symlink issues', () => {})
    return
  }

  it('should work', async () => {
    expect.assertions(1)
    try {
      await recursiveCopy(resolveDataDir, testResolveDataDir)
      await fs.symlink('./aa', join(testResolveDataDir, 'symlink'))
      await recursiveDelete(testResolveDataDir)
      const result = await recursiveReadDir(testResolveDataDir)
      expect(result.length).toBe(0)
    } finally {
      await recursiveDelete(testResolveDataDir)
    }
  })

  it('should exclude', async () => {
    expect.assertions(2)
    try {
      await recursiveCopy(resolveDataDir, testpreservefileDir, {
        overwrite: true,
      })
      // preserve cache dir
      await recursiveDelete(testpreservefileDir, /^cache/)

      const result = await recursiveReadDir(testpreservefileDir)
      expect(result.length).toBe(1)
    } finally {
      // Ensure test cleanup
      await recursiveDelete(testpreservefileDir)

      const cleanupResult = await recursiveReadDir(testpreservefileDir)
      expect(cleanupResult.length).toBe(0)
    }
  })
})
