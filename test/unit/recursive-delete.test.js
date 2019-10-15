/* global fixture, test */
import 'testcafe'
import { recursiveDelete } from 'next/dist/lib/recursive-delete'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const testResolveDataDir = join(__dirname, '..', 'isolated', 'test_resolvedata')

fixture('recursiveDelete')

test('should work', async t => {
  await recursiveCopy(resolveDataDir, testResolveDataDir)

  await recursiveDelete(testResolveDataDir)
  const result = await recursiveReadDir(testResolveDataDir, /.*/)
  await t.expect(result.length).eql(0)
})
