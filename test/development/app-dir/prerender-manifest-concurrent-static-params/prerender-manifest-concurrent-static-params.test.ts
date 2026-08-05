import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('prerender-manifest-concurrent-static-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps every route in the manifest when static params resolve concurrently', async () => {
    const routes = ['/four/a', '/one/a', '/three/a', '/two/a']

    const responses = await Promise.all(
      routes.map((route) => next.fetch(route))
    )

    for (const response of responses) {
      expect(response.status).toBe(200)
    }

    await retry(async () => {
      const manifest = await next.readJSON('.next/dev/prerender-manifest.json')

      expect(Object.keys(manifest.dynamicRoutes).sort()).toEqual([
        '/four/[slug]',
        '/one/[slug]',
        '/three/[slug]',
        '/two/[slug]',
      ])
      expect(Object.keys(manifest.routes).sort()).toEqual(routes)
    })
  })
})
