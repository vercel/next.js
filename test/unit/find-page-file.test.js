/* global fixture, test */
import 'testcafe'
import { findPageFile } from 'next/dist/server/lib/find-page-file'
import { normalizePagePath } from 'next/dist/next-server/server/normalize-page-path'

import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

fixture('findPageFile')

test('should work', async t => {
  const pagePath = normalizePagePath('/nav/about')
  const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
  await t.expect(result).match(/^[\\/]nav[\\/]about\.js/)
})

test('should work with nested index.js', async t => {
  const pagePath = normalizePagePath('/nested')
  const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
  await t.expect(result).match(/^[\\/]nested[\\/]index\.js/)
})

test('should prefer prefered.js before prefered/index.js', async t => {
  const pagePath = normalizePagePath('/prefered')
  const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
  await t.expect(result).match(/^[\\/]prefered\.js/)
})
