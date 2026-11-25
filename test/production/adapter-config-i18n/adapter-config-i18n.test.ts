import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'
import { RouteKind } from 'next/dist/server/route-kind'

describe('adapter config with i18n routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Dynamic Pages API routes are localized like any other dynamic route. The
  // Vercel adapter's i18n rules prefix the locale onto `/api/...` too, so the
  // matcher has to expect it — if the two disagree the matcher is unreachable
  // and requests fall through to `/{locale}/404`. See vercel/next.js#96935.
  it('localizes dynamic Pages API routes', async () => {
    const { outputs, routing }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const apiOutput = outputs.pagesApi.find(
      (output) => output.pathname === '/api/proxy/[[...slug]]'
    )
    const apiRoute = routing.dynamicRoutes.find(
      (route) => route.source === '/api/proxy/[[...slug]]'
    )
    const pageRoute = routing.dynamicRoutes.find(
      (route) => route.source === '/blog/[slug]'
    )

    expect(apiOutput).toBeDefined()
    expect(apiRoute).toBeDefined()
    expect(apiRoute?.sourceRegex).toContain('nextLocale')
    expect(apiRoute?.destination).toBe(
      '/$nextLocale/api/proxy/[[...slug]]?nxtPslug=$nxtPslug'
    )

    expect(pageRoute).toBeDefined()
    expect(pageRoute?.sourceRegex).toContain('nextLocale')
    expect(pageRoute?.destination).toBe(
      '/$nextLocale/blog/[slug]?nxtPslug=$nxtPslug'
    )
  })

  it('resolves localized prerenders and fallback shells to scoped files', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')
    for (const locale of ['en', 'fr']) {
      for (const slug of ['first', '[slug]']) {
        const pathname = `/${locale}/fallback/${slug}`
        const output = outputs.prerenders.find(
          (item) => item.pathname === pathname
        )
        const artifact = next.getPrerenderFilePath(pathname, '.html', {
          router: 'pages',
          route: {
            kind: RouteKind.PAGES,
            sourceRoute: '/fallback/[slug]',
          },
        })
        expect(output?.fallback?.filePath).toBe(
          path.join(next.testDir, artifact)
        )
        expect(await next.hasFile(artifact)).toBe(true)
        expect(await next.hasFile(`.next/server/pages${pathname}.html`)).toBe(
          false
        )
        expect(await next.hasFile(`.next/server/pages${pathname}.json`)).toBe(
          false
        )
        expect(await next.hasFile(`.next/server/pages${pathname}.meta`)).toBe(
          false
        )
        expect(await next.hasFile(artifact.replace(/\.html$/, '.meta'))).toBe(
          true
        )
        if (slug === 'first') {
          expect(await next.hasFile(artifact.replace(/\.html$/, '.json'))).toBe(
            true
          )
        }
      }
    }
  })

  it('does not emit outputs multiple times for a given pathname', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const pathnameSet = (f) => new Set(f.map((o) => o.pathname))

    expect(pathnameSet(outputs.pages).size).toBe(outputs.pages.length)
    expect(pathnameSet(outputs.appPages).size).toBe(outputs.appPages.length)
    expect(pathnameSet(outputs.pagesApi).size).toBe(outputs.pagesApi.length)
    expect(pathnameSet(outputs.appRoutes).size).toBe(outputs.appRoutes.length)
    expect(pathnameSet(outputs.prerenders).size).toBe(outputs.prerenders.length)
    expect(pathnameSet(outputs.staticFiles).size).toBe(
      outputs.staticFiles.length
    )
  })
})
