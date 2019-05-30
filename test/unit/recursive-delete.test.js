/* eslint-env jest */
import { recursiveDelete } from 'next/dist/lib/recursive-delete'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import cp from 'recursive-copy'
import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const testResolveDataDir = join(__dirname, '..', 'isolated', 'test_resolvedata')

describe('recursiveDelete', () => {
  it('should work', async () => {
    await cp(resolveDataDir, testResolveDataDir, { expand: true })

    await recursiveDelete(testResolveDataDir)
    const result = await recursiveReadDir(testResolveDataDir, /.*/)
    expect(result.length).toBe(0)
  })
})
