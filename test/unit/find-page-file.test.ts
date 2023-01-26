/* eslint-env jest */
import {
  findPageFile,
  isLayoutsLeafPage,
} from 'next/dist/server/lib/find-page-file'
import { normalizePagePath } from 'next/dist/shared/lib/page-path/normalize-page-path'

import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

describe('findPageFile', () => {
  it('should work', async () => {
    const pagePath = normalizePagePath('/nav/about')
    const result = await findPageFile(
      dirWithPages,
      pagePath,
      ['jsx', 'js'],
      false
    )
    expect(result).toMatch(/^[\\/]nav[\\/]about\.js/)
  })

  it('should work with nested index.js', async () => {
    const pagePath = normalizePagePath('/nested')
    const result = await findPageFile(
      dirWithPages,
      pagePath,
      ['jsx', 'js'],
      false
    )
    expect(result).toMatch(/^[\\/]nested[\\/]index\.js/)
  })

  it('should prefer prefered.js before preferred/index.js', async () => {
    const pagePath = normalizePagePath('/prefered')
    const result = await findPageFile(
      dirWithPages,
      pagePath,
      ['jsx', 'js'],
      false
    )
    expect(result).toMatch(/^[\\/]prefered\.js/)
  })
})

describe('isLayoutsLeafPage', () => {
  const pageExtensions = ['tsx', 'ts', 'jsx', 'js']
  it('should determine either server or client component page file as leaf node page', () => {
    expect(isLayoutsLeafPage('page.js', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('./page.js', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('./page.jsx', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('/page.ts', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('/path/page.tsx', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('\\path\\page.tsx', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('.\\page.jsx', pageExtensions)).toBe(true)
    expect(isLayoutsLeafPage('\\page.js', pageExtensions)).toBe(true)
  })

  it('should determine other files under layout routes as non leaf node', () => {
    expect(isLayoutsLeafPage('./not-a-page.js', pageExtensions)).toBe(false)
    expect(isLayoutsLeafPage('not-a-page.js', pageExtensions)).toBe(false)
    expect(isLayoutsLeafPage('./page.component.jsx', pageExtensions)).toBe(
      false
    )
    expect(isLayoutsLeafPage('layout.js', pageExtensions)).toBe(false)
    expect(isLayoutsLeafPage('page', pageExtensions)).toBe(false)
  })
})
