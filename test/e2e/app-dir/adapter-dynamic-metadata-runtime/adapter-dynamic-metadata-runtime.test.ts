import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'

describe('adapter-dynamic-metadata-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The custom adapter's build output is only available in local production mode.
  // @force-gate start
  it('should preserve runtime from the original metadata source', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    expect(
      outputs.appRoutes.find((item) => item.pathname === '/robots.txt')
    ).toMatchObject({ runtime: 'edge' })
    expect(
      outputs.appRoutes.find((item) => item.pathname === '/sitemap.xml')
    ).toMatchObject({ runtime: 'nodejs' })
  })

  it('should serve dynamic metadata routes with explicit runtimes', async () => {
    const robots = await next.fetch('/robots.txt')
    expect(robots.status).toBe(200)
    expect(robots.headers.get('content-type')).toContain('text/plain')
    expect(await robots.text()).toContain('User-Agent: *')

    const sitemap = await next.fetch('/sitemap.xml')
    expect(sitemap.status).toBe(200)
    expect(sitemap.headers.get('content-type')).toBe('application/xml')
    expect(await sitemap.text()).toContain('<urlset')
  })
})
