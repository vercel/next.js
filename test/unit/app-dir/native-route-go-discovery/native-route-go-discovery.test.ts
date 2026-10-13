import {
  createValidFileMatcher,
  findPageFile,
} from 'next/dist/server/lib/find-page-file'
import { getAppPageStaticInfo } from 'next/dist/build/analysis/get-page-static-info'
import { createPagesMapping } from 'next/dist/build/route-discovery'
import { PAGE_TYPES } from 'next/dist/lib/page-types'
import { join } from 'path'
import { normalizePathSep } from 'next/dist/shared/lib/page-path/normalize-path-sep'
const {
  findPagePathData,
} = require('next/dist/server/dev/on-demand-entry-handler')

describe('native route discovery', () => {
  const matcher = createValidFileMatcher(['tsx', 'ts', 'jsx', 'js'], '/app')
  it('recognizes only the native route convention, including Windows separators', () => {
    for (const path of [
      '/app/users/[id]/route.go',
      'app\\users\\[id]\\route.go',
    ]) {
      expect(matcher.isAppRouterPage(path)).toBe(true)
      expect(matcher.isAppRouterRoute(path)).toBe(true)
    }
    for (const path of [
      '/app/page.go',
      '/app/layout.go',
      '/app/helper.go',
      '/app/proxy.go',
    ]) {
      expect(matcher.isAppRouterPage(path)).toBe(false)
    }
    expect(matcher.isPageFile('/pages/api/route.go')).toBe(false)
  })
  it('maps grouped Go routes without changing page extensions', async () => {
    const mapped = await createPagesMapping({
      isDev: true,
      pageExtensions: ['tsx', 'ts'],
      pagePaths: ['(group)/[id]/route.go'],
      pagesType: PAGE_TYPES.APP,
      pagesDir: '/app',
      appDir: '/app',
      appDirOnly: false,
    })
    expect(mapped['(group)/[id]/route']).toContain('route.go')
  })
  it('reports Webpack and missing opt-in before JavaScript analysis', async () => {
    const saved = process.env.TURBOPACK
    try {
      delete process.env.TURBOPACK
      await expect(
        getAppPageStaticInfo({
          pageFilePath: '/app/route.go',
          nextConfig: { experimental: { goRoutes: true } },
          isDev: true,
          page: '/route',
          pageType: PAGE_TYPES.APP,
        })
      ).rejects.toThrow('requires Turbopack')
      process.env.TURBOPACK = '1'
      await expect(
        getAppPageStaticInfo({
          pageFilePath: '/app/route.go',
          nextConfig: {},
          isDev: true,
          page: '/route',
          pageType: PAGE_TYPES.APP,
        })
      ).rejects.toThrow('experimental.goRoutes')
    } finally {
      if (saved === undefined) delete process.env.TURBOPACK
      else process.env.TURBOPACK = saved
    }
  })
  it('normalizes the native filesystem ensure fallback', async () => {
    const result = await findPagePathData(
      __dirname,
      '/native/route',
      ['ts'],
      undefined,
      join(__dirname, 'app'),
      false
    )
    expect(result.page).toBe('/native/route')
    expect(normalizePathSep(result.filename)).toContain('/app/native/route.go')
  })
  it('diagnoses Go and TS handlers in the same directory', async () => {
    await expect(
      findPageFile(join(__dirname, 'app'), '/route', ['ts'], true)
    ).rejects.toThrow('Conflicting App Router handlers')
  })
})
