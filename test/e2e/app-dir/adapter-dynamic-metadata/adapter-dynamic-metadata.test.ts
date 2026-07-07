import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'

describe('adapter-dynamic-metadata', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('should skip next dev', () => {})
    return
  }

  if (!isNextDeploy) {
    it('should classify dynamic metadata routes as app routes in adapter outputs', async () => {
      const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('build-complete.json')

      const expectedDynamicMetadataRoutes = [
        '/robots.txt',
        '/sitemap.xml',
        '/favicon.ico',
      ]
      const staticFilePathnames = outputs.staticFiles.map(
        (item) => item.pathname
      )
      const prerenderPathnames = outputs.prerenders.map((item) => item.pathname)
      const appRoutePathnames = outputs.appRoutes.map((item) => item.pathname)

      expect(staticFilePathnames).toEqual(
        expect.not.arrayContaining(expectedDynamicMetadataRoutes)
      )
      expect(prerenderPathnames).toEqual(
        expect.not.arrayContaining(expectedDynamicMetadataRoutes)
      )
      expect(appRoutePathnames).toEqual(
        expect.arrayContaining(expectedDynamicMetadataRoutes)
      )

      for (const pathname of expectedDynamicMetadataRoutes) {
        const appRoute = outputs.appRoutes.find(
          (item) => item.pathname === pathname
        )
        expect(appRoute?.runtime).toBe('nodejs')
      }
    })
  }

  it('should serve dynamic metadata routes', async () => {
    const robots = await next.fetch('/robots.txt')
    expect(robots.status).toBe(200)
    expect(robots.headers.get('content-type')).toContain('text/plain')
    expect(await robots.text()).toContain('User-Agent: *')

    const sitemap = await next.fetch('/sitemap.xml')
    expect(sitemap.status).toBe(200)
    expect(sitemap.headers.get('content-type')).toBe('application/xml')
    expect(await sitemap.text()).toContain('<urlset')

    const favicon = await next.fetch('/favicon.ico')
    expect(favicon.status).toBe(200)
    expect(favicon.headers.get('content-type')).toContain('image/x-icon')
    expect(await favicon.text()).toContain('dynamic favicon')
  })
})
