/* eslint-env jest */
import {
  findPageFile,
  createValidFileMatcher,
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

describe('createPageFileMatcher', () => {
  describe('isAppRouterPage', () => {
    const pageExtensions = ['tsx', 'ts', 'jsx', 'js']
    const fileMatcher = createValidFileMatcher(pageExtensions, '')

    it('should determine either server or client component page file as leaf node page', () => {
      expect(fileMatcher.isAppRouterPage('page.js')).toBe(true)
      expect(fileMatcher.isAppRouterPage('./page.js')).toBe(true)
      expect(fileMatcher.isAppRouterPage('./page.jsx')).toBe(true)
      expect(fileMatcher.isAppRouterPage('/page.ts')).toBe(true)
      expect(fileMatcher.isAppRouterPage('/path/page.tsx')).toBe(true)
      expect(fileMatcher.isAppRouterPage('\\path\\page.tsx')).toBe(true)
      expect(fileMatcher.isAppRouterPage('.\\page.jsx')).toBe(true)
      expect(fileMatcher.isAppRouterPage('\\page.js')).toBe(true)
    })

    it('should determine other files under layout routes as non leaf node', () => {
      expect(fileMatcher.isAppRouterPage('./not-a-page.js')).toBe(false)
      expect(fileMatcher.isAppRouterPage('not-a-page.js')).toBe(false)
      expect(fileMatcher.isAppRouterPage('./page.component.jsx')).toBe(false)
      expect(fileMatcher.isAppRouterPage('layout.js')).toBe(false)
      expect(fileMatcher.isAppRouterPage('page')).toBe(false)
    })
  })

  describe('isMetadataRouteFile', () => {
    it('should determine top level metadata routes', () => {
      const pageExtensions = ['tsx', 'ts', 'jsx', 'js']
      const fileMatcher = createValidFileMatcher(pageExtensions, 'app')
      expect(fileMatcher.isMetadataFile('app/route.js')).toBe(false)
      expect(fileMatcher.isMetadataFile('app/page.js')).toBe(false)
      expect(fileMatcher.isMetadataFile('pages/index.js')).toBe(false)

      expect(fileMatcher.isMetadataFile('app/robots.txt')).toBe(true)
      expect(fileMatcher.isMetadataFile('app/path/robots.txt')).toBe(false)

      expect(fileMatcher.isMetadataFile('app/sitemap.xml')).toBe(true)
      expect(fileMatcher.isMetadataFile('app/path/sitemap.xml')).toBe(true)
    })
  })
})
