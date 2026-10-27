import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type AdapterOutputs = Parameters<NextAdapter['onBuildComplete']>[0]['outputs']

describe('adapter-metadata-revalidate', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep a revalidating robots.txt route as a prerender', async () => {
    const outputs: AdapterOutputs = await next.readJSON('build-complete.json')

    expect(
      outputs.staticFiles.find((item) => item.pathname === '/robots.txt')
    ).toBeUndefined()

    const prerender = outputs.prerenders.find(
      (item) => item.pathname === '/robots.txt'
    )
    expect(prerender?.fallback?.initialRevalidate).toBe(3600)
    expect(
      prerender?.fallback?.initialHeaders?.['x-next-cache-tags']
    ).toContain('adapter-metadata-revalidate:robots')

    const appRoute = outputs.appRoutes.find(
      (item) => item.pathname === '/robots.txt'
    )
    expect(appRoute).toBeDefined()
    expect(prerender?.parentOutputId).toBe(appRoute?.id)
  })

  it('should still output a static metadata file as a static file', async () => {
    const outputs: AdapterOutputs = await next.readJSON('build-complete.json')

    expect(
      outputs.staticFiles.find((item) => item.pathname === '/favicon.ico')
    ).toBeDefined()
    expect(
      outputs.prerenders.find((item) => item.pathname === '/favicon.ico')
    ).toBeUndefined()
    expect(
      outputs.appRoutes.find((item) => item.pathname === '/favicon.ico')
    ).toBeUndefined()
  })
})
