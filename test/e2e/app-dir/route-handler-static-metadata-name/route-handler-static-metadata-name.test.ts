import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'

describe('route-handler-static-metadata-name', () => {
  const { next, isNextStart, isNextDev, isNextDeploy, skipped } = nextTestSetup(
    {
      files: __dirname,
    }
  )

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should not treat a route handler named like a static metadata file as one', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      const routes = Object.keys(prerenderManifest.routes)

      // A route handler is not prerendered once to the `-` placeholder.
      expect(routes).not.toContain('/-/sitemap.xml')
      expect(routes).not.toContain('/-/gsp/sitemap.xml')

      // Its own generateStaticParams still applies.
      expect(routes).toContain('/a/gsp/sitemap.xml')
      expect(routes).toContain('/b/gsp/sitemap.xml')
      expect(Object.keys(prerenderManifest.dynamicRoutes)).toContain(
        '/[siteName]/gsp/sitemap.xml'
      )

      // A real static metadata file still prerenders once to the placeholder.
      expect(routes).toContain('/-/static/sitemap.xml')
    })
  }

  if (!isNextDev && !isNextDeploy) {
    it('should classify route handlers named like static metadata files as route handlers in adapter outputs', async () => {
      const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('build-complete.json')
      const pathnames = (items: Array<{ pathname: string }>) =>
        items.map((item) => item.pathname)

      expect(pathnames(outputs.appRoutes)).toEqual(
        expect.arrayContaining([
          '/[siteName]/sitemap.xml',
          '/[siteName]/gsp/sitemap.xml',
        ])
      )
      expect(pathnames(outputs.prerenders)).toEqual(
        expect.arrayContaining([
          '/[siteName]/gsp/sitemap.xml',
          '/a/gsp/sitemap.xml',
          '/b/gsp/sitemap.xml',
        ])
      )
      expect(pathnames(outputs.staticFiles)).toEqual(
        expect.not.arrayContaining(['/a/gsp/sitemap.xml', '/b/gsp/sitemap.xml'])
      )

      // A real static metadata file is still emitted once as a static file.
      expect(pathnames(outputs.staticFiles)).toContain('/-/static/sitemap.xml')
    })
  }

  it('should serve the route handler with its own params', async () => {
    for (const siteName of ['a', 'b', 'other']) {
      const res = await next.fetch(`/${siteName}/sitemap.xml`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(`site=${siteName}`)
    }
  })

  it('should serve the route handler that has generateStaticParams', async () => {
    for (const siteName of ['a', 'b', 'other']) {
      const res = await next.fetch(`/${siteName}/gsp/sitemap.xml`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(`gsp-site=${siteName}`)
    }
  })

  it('should serve a static sitemap.xml file under a dynamic segment', async () => {
    const res = await next.fetch('/anything/static/sitemap.xml')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<urlset')
  })
})
