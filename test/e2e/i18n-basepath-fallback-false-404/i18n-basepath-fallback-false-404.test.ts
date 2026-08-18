import { nextTestSetup } from 'e2e-utils'

describe('i18n-basepath-fallback-false-404', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/docs/api/blog/first', { slug: 'first' }],
    ['/docs/api/catchall/hello/world', { rest: ['hello', 'world'] }],
  ])('should resolve the dynamic API route %s', async (pathname, expected) => {
    const res = await next.fetch(pathname)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(expected)
  })
})
