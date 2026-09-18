import { nextTestSetup } from 'e2e-utils'

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

  it.each([
    ['%5B%5B...filterSlugs%5D%5D', '[[...filterSlugs]]'],
    ['%255B%255B...filterSlugs%255D%255D', '%5B%5B...filterSlugs%5D%5D'],
    [
      '%25255B%25255B...filterSlugs%25255D%25255D',
      '%255B%255B...filterSlugs%255D%255D',
    ],
  ])('decodes the literal pathname %s once', async (pathname, value) => {
    const res = await next.fetch(`/en/${pathname}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ locale: 'en', filterSlugs: [value] })
  })

  it('omits an absent optional catch-all', async () => {
    const res = await next.fetch('/en')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ locale: 'en' })
  })
})
