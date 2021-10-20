/* eslint-env jest */
import { findPageFile } from 'next/dist/server/lib/find-page-file'
import { normalizePagePath } from 'next/dist/server/normalize-page-path'

import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

describe('findPageFile', () => {
  it('should work', async () => {
    const pagePath = normalizePagePath('/nav/about')
    const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
    expect(result).toMatch(/^[\\/]nav[\\/]about\.js/)
  })

  it('should work with nested index.js', async () => {
    const pagePath = normalizePagePath('/nested')
    const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
    expect(result).toMatch(/^[\\/]nested[\\/]index\.js/)
  })

  it('should prefer prefered.js before prefered/index.js', async () => {
    const pagePath = normalizePagePath('/prefered')
    const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
    expect(result).toMatch(/^[\\/]prefered\.js/)
  })

  it('should be able to resolve the pageKey: *.other', async () => {
    const pagePath = normalizePagePath('/prefered.other')
    const result = await findPageFile(dirWithPages, pagePath, ['jsx', 'js'])
    expect(result).toMatch(/^[\\/]prefered\.other\.js/)
  })

  it('should prefer .js before .other.js', async () => {
    const pagePath = normalizePagePath('/prefered')
    const result = await findPageFile(dirWithPages, pagePath, [
      'jsx',
      'js',
      'other.jsx',
      'other.js',
    ])
    expect(result).toMatch(/^[\\/]prefered\.js/)
  })

  it('should prefer .other.js before .js', async () => {
    const pagePath = normalizePagePath('/prefered')
    const result = await findPageFile(dirWithPages, pagePath, [
      'other.jsx',
      'other.js',
      'jsx',
      'js',
    ])
    expect(result).toMatch(/^[\\/]prefered\.other\.js/)
  })

  it('should not match a different page extension', async () => {
    const pagePath = normalizePagePath('/prefered')
    const result = await findPageFile(dirWithPages, pagePath, [
      'dne.jsx',
      'dne.js',
    ])
    expect(result).toBe(null)
  })
})
