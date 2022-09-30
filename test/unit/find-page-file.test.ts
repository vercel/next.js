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
  it('should determine either server or client component page file as leaf node page', () => {
    expect(isLayoutsLeafPage('page.js')).toBe(true)
    expect(isLayoutsLeafPage('./page.server.js')).toBe(true)
    expect(isLayoutsLeafPage('./page.server.jsx')).toBe(true)
    expect(isLayoutsLeafPage('./page.client.ts')).toBe(true)
    expect(isLayoutsLeafPage('./page.client.tsx')).toBe(true)
  })

  it('should determine other files under layout routes as non leaf node', () => {
    expect(isLayoutsLeafPage('./page.component.jsx')).toBe(false)
    expect(isLayoutsLeafPage('layout.js')).toBe(false)
  })
})
