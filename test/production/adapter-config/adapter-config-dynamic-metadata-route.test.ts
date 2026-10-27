import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-config dynamic metadata route', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'dynamic-metadata-route/app')),
      'next.config.mjs': new FileRef(
        path.join(__dirname, 'dynamic-metadata-route/next.config.mjs')
      ),
      'my-adapter.mjs': new FileRef(path.join(__dirname, 'my-adapter.mjs')),
    },
  })

  it('prerenders route handlers at metadata paths per generateStaticParams', async () => {
    const prerenderManifest = await next.readJSON(
      '.next/prerender-manifest.json'
    )

    expect(
      prerenderManifest.routes['/adm-dynamic-sitemap/first/sitemap.xml']
    ).toMatchObject({
      srcRoute: '/adm-dynamic-sitemap/[slug]/sitemap.xml',
      initialRevalidateSeconds: 60,
    })
    expect(
      prerenderManifest.dynamicRoutes['/adm-dynamic-sitemap/[slug]/sitemap.xml']
    ).toBeDefined()
    expect(
      prerenderManifest.routes['/adm-dynamic-sitemap/-/sitemap.xml']
    ).toBeUndefined()
    // A metadata function under a dynamic segment renders on demand like any
    // other dynamic route handler without generateStaticParams.
    expect(
      prerenderManifest.routes['/adm-sitemap-fn/-/sitemap.xml']
    ).toBeUndefined()

    // Static metadata files under dynamic segments still prerender once to
    // the canonical `-` pathname.
    expect(
      prerenderManifest.routes['/adm-static-icon/-/icon.png']
    ).toBeDefined()
    expect(
      prerenderManifest.dynamicRoutes['/adm-static-icon/[slug]/icon.png']
    ).toBeUndefined()
  })

  it('gives route handlers at metadata paths a dynamic ISR fallback', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const fallback = outputs.prerenders.find(
      (item) => item.pathname === '/docs/adm-dynamic-sitemap/[slug]/sitemap.xml'
    )
    expect(fallback).toBeDefined()
    expect(fallback.parentOutputId).toBe(
      '/adm-dynamic-sitemap/[slug]/sitemap.xml'
    )

    const allPathnames = [
      ...outputs.prerenders.map((item) => item.pathname),
      ...outputs.staticFiles.map((item) => item.pathname),
    ]
    expect(allPathnames).toContain(
      '/docs/adm-dynamic-sitemap/first/sitemap.xml'
    )
    expect(allPathnames).not.toContain(
      '/docs/adm-dynamic-sitemap/-/sitemap.xml'
    )
    expect(allPathnames).not.toContain('/docs/adm-sitemap-fn/-/sitemap.xml')
    expect(allPathnames).toContain('/docs/adm-static-icon/-/icon.png')
  })

  it('caches route handler responses at metadata paths', async () => {
    for (const slug of ['first', 'second']) {
      const pathname = `/docs/adm-dynamic-sitemap/${slug}/sitemap.xml`
      const first = await next.fetch(pathname)
      expect(first.status).toBe(200)
      const firstBody = await first.text()
      expect(firstBody).toContain(`https://example.com/${slug}`)

      const second = await next.fetch(pathname)
      expect(second.headers.get('x-nextjs-cache')).toBe('HIT')
      expect(await second.text()).toBe(firstBody)
    }

    const res = await next.fetch('/docs/adm-sitemap-fn/any/sitemap.xml')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('https://example.com/adm-sitemap-fn')
  })
})
