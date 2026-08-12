import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

// Regression test for https://github.com/vercel/next.js/issues/97231
// With `i18n` configured, the adapter routing entry for a dynamic Pages Router
// API route stopped accepting the locale-prefixed pathname that i18n routing
// resolves to, so deployments served the 404 page instead of the API function.
describe('adapter i18n dynamic Pages API route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('matches locale-prefixed requests for dynamic Pages API routes', async () => {
    const { outputs, routing }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    expect(
      outputs.pagesApi.find((output) => output.pathname === '/api/dynamic/[id]')
    ).toBeDefined()

    const apiRoute = routing.dynamicRoutes.find(
      (route) => route.source === '/api/dynamic/[id]'
    )
    const pageRoute = routing.dynamicRoutes.find(
      (route) => route.source === '/blog/[slug]'
    )

    expect(apiRoute).toBeDefined()
    expect(pageRoute).toBeDefined()

    const apiRegex = new RegExp(apiRoute.sourceRegex)
    const pageRegex = new RegExp(pageRoute.sourceRegex)

    // the dynamic page route matches every locale prefix
    expect(pageRegex.test('/de/blog/hello')).toBe(true)
    expect(pageRegex.test('/en/blog/hello')).toBe(true)

    // the dynamic API route has to do the same, otherwise the locale-prefixed
    // pathname falls through to the 404 output
    expect(apiRegex.test('/de/api/dynamic/123')).toBe(true)
    expect(apiRegex.test('/en/api/dynamic/123')).toBe(true)
  })
})
