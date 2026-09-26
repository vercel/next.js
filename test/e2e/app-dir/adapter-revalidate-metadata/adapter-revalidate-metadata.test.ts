import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('adapter-revalidate-metadata', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextDev && !isNextDeploy) {
    it('should classify revalidating metadata routes as prerenders in adapter outputs', async () => {
      const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('build-complete.json')

      const staticFilePathnames = outputs.staticFiles.map(
        (item) => item.pathname
      )
      const appRoutePathnames = outputs.appRoutes.map((item) => item.pathname)

      for (const pathname of ['/robots.txt', '/sitemap.xml']) {
        expect(staticFilePathnames).not.toContain(pathname)
        expect(appRoutePathnames).toContain(pathname)

        const prerender = outputs.prerenders.find(
          (item) => item.pathname === pathname
        )
        expect(prerender?.fallback?.initialRevalidate).toBe(2)
      }

      // Metadata routes without revalidate stay static files
      expect(staticFilePathnames).toContain('/manifest.json')
      expect(appRoutePathnames).not.toContain('/manifest.json')
    })
  }

  it('should regenerate revalidating metadata routes', async () => {
    const getLastModified = async () => {
      const res = await next.fetch('/sitemap.xml')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/xml')
      return (await res.text()).match(/<lastmod>(.+?)<\/lastmod>/)?.[1]
    }

    const initialLastModified = await getLastModified()
    expect(initialLastModified).toBeDefined()

    await retry(async () => {
      expect(await getLastModified()).not.toBe(initialLastModified)
    }, 10_000)
  })
})
