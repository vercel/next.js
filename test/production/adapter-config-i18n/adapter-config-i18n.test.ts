import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter config with i18n routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps dynamic Pages API routes in the canonical namespace', async () => {
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

    expect(routing.version).toBe(2)
    expect(apiOutput).toBeDefined()
    expect(apiRoute).toBeDefined()
    expect(apiRoute?.sourceRegex).not.toContain('nextLocale')
    expect(apiRoute?.destination).toBe(
      '/api/proxy/[[...slug]]?nxtPslug=$nxtPslug'
    )

    expect(pageRoute).toBeDefined()
    expect(pageRoute?.sourceRegex).toContain('nextLocale')
    expect(pageRoute?.destination).toBe(
      '/$nextLocale/blog/[slug]?nxtPslug=$nxtPslug'
    )
  })

  it('keeps dynamic App routes in the literal namespace', async () => {
    const { outputs, routing }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const appPageOutput = outputs.appPages.find(
      (output) => output.pathname === '/[lang]'
    )
    const appRouteOutput = outputs.appRoutes.find(
      (output) => output.pathname === '/[lang]/endpoint'
    )
    const appPageRoute = routing.dynamicRoutes.find(
      (route) => route.source === '/[lang]'
    )
    const appRoute = routing.dynamicRoutes.find(
      (route) => route.source === '/[lang]/endpoint'
    )

    expect(appPageOutput).toBeDefined()
    expect(appRouteOutput).toBeDefined()

    expect(appPageRoute).toBeDefined()
    expect(appPageRoute?.sourceRegex).not.toContain('nextLocale')
    expect(appPageRoute?.destination).toBe('/[lang]?nxtPlang=$nxtPlang')

    expect(appRoute).toBeDefined()
    expect(appRoute?.sourceRegex).not.toContain('nextLocale')
    expect(appRoute?.destination).toBe('/[lang]/endpoint?nxtPlang=$nxtPlang')
  })

  it('links prerenders with locale-like App segments to their App output', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const appPageOutput = outputs.appPages.find(
      (output) => output.pathname === '/fr/static'
    )
    const prerenderOutput = outputs.prerenders.find(
      (output) => output.pathname === '/fr/static'
    )

    expect(appPageOutput).toBeDefined()
    expect(prerenderOutput).toBeDefined()
    expect(prerenderOutput?.parentOutputId).toBe(appPageOutput?.id)
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
