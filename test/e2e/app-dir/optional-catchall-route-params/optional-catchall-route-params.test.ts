import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('optional-catchall-route-params', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['index', ''])(
    'preserves pathname params with slug=%s in the query',
    async (slug) => {
      const res = await next.fetch(`/shop/books?slug=${slug}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ slug: ['books'] })
    }
  )

  it('omits an absent optional catch-all', async () => {
    const res = await next.fetch('/en')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ locale: 'en' })
  })
})
