import { nextTestSetup } from 'e2e-utils'

describe('dynamicParams false with Cache Components', () => {
  const { next, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('serves only the exact generated page param tuples', async () => {
    for (const pathname of ['/products/en/a', '/products/fr/b']) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await next.fetch(pathname)
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('id="closed-route-page"')
      }
    }

    const outputIndex = next.cliOutput.length

    for (const pathname of ['/products/en/b', '/products/fr/a']) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await next.fetch(pathname)
        const html = await response.text()

        expect(response.status).toBe(404)
        expect(html).not.toContain('id="closed-route-loading"')
        expect(html).not.toContain('id="closed-route-page"')
      }
    }

    const rscResponse = await next.fetch('/products/en/b', {
      headers: { rsc: '1' },
    })
    expect(rscResponse.status).toBe(404)

    if (!isNextDeploy) {
      const requestOutput = next.cliOutput.slice(outputIndex)
      expect(requestOutput).not.toContain('[closed-route-page] en/b')
      expect(requestOutput).not.toContain('[closed-route-page] fr/a')
      expect(requestOutput).not.toContain('[closed-route-metadata] en/b')
      expect(requestOutput).not.toContain('[closed-route-metadata] fr/a')
      expect(requestOutput).not.toContain('UNKNOWN_CLOSED_ROUTE_RENDERED')
    }
  })

  it('rejects unknown route handler params before calling GET', async () => {
    const knownResponse = await next.fetch('/api/en/a')
    expect(knownResponse.status).toBe(200)
    expect(await knownResponse.json()).toEqual({ locale: 'en', slug: 'a' })

    const outputIndex = next.cliOutput.length

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await next.fetch('/api/en/b')
      expect(response.status).toBe(404)
    }

    if (!isNextDeploy) {
      const requestOutput = next.cliOutput.slice(outputIndex)
      expect(requestOutput).not.toContain('[closed-route-handler] en/b')
      expect(requestOutput).not.toContain('UNKNOWN_CLOSED_HANDLER_RENDERED')
    }
  })

  it('closes complete tuples generated across a layout and page', async () => {
    for (const pathname of ['/layout-closed/en/a', '/layout-closed/fr/b']) {
      expect((await next.fetch(pathname)).status).toBe(200)
    }

    for (const pathname of ['/layout-closed/en/b', '/layout-closed/fr/a']) {
      expect((await next.fetch(pathname)).status).toBe(404)
    }
  })

  it('supports closed catch-all and optional catch-all routes', async () => {
    for (const pathname of [
      '/catch/one',
      '/catch/one/two',
      '/optional',
      '/optional/known',
    ]) {
      expect((await next.fetch(pathname)).status).toBe(200)
    }

    for (const pathname of [
      '/catch/two',
      '/catch/one/three',
      '/optional/missing',
    ]) {
      expect((await next.fetch(pathname)).status).toBe(404)
    }
  })

  if (isNextStart) {
    it('emits generated tuples and closed dynamic routes in the manifest', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      expect(manifest.routes).toEqual(
        expect.objectContaining({
          '/products/en/a': expect.any(Object),
          '/products/fr/b': expect.any(Object),
          '/api/en/a': expect.any(Object),
          '/api/fr/b': expect.any(Object),
          '/layout-closed/en/a': expect.any(Object),
          '/layout-closed/fr/b': expect.any(Object),
          '/catch/one': expect.any(Object),
          '/catch/one/two': expect.any(Object),
          '/optional': expect.any(Object),
          '/optional/known': expect.any(Object),
        })
      )

      for (const route of [
        '/products/[locale]/[slug]',
        '/api/[locale]/[slug]',
        '/layout-closed/[locale]/[slug]',
        '/catch/[...slug]',
        '/optional/[[...slug]]',
      ]) {
        expect(manifest.dynamicRoutes[route].fallback).toBe(false)
      }
    })
  }
})
